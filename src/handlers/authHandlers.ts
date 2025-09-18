import { Context } from 'hono';
import { sign } from 'hono/jwt';
import { Env, UserData } from '../config/types/common';
import { AuthService } from '../services/AuthService';
import { LoginRequest, LoginResponse, RegisterRequest, RegisterResponse, ProfileResponse, CloudflareD1Client } from '../config/types/auth';

/**
 * Classe responsável por lidar com as operações de autenticação e perfil de usuário.
 */
export class AuthHandlers {
  /**
   * Cria uma instância do cliente Cloudflare D1.
   * @param env Variáveis de ambiente necessárias para autenticação no D1.
   * @returns Instância de CloudflareD1Client.
   */
  private static createD1Client(env: Env): CloudflareD1Client {
    return new CloudflareD1Client({
      accountId: env.CLOUDFLARE_ACCOUNT_ID,
      databaseId: env.CLOUDFLARE_D1_DATABASE_ID,
      apiToken: env.CLOUDFLARE_API_TOKEN,
    });
  }

  /**
   * Handler para login de usuário.
   * Valida as credenciais e retorna um JWT e token de sessão.
   * @param c Contexto do Hono contendo as bindings do ambiente.
   * @returns Resposta JSON com sucesso ou erro.
   */
  static async loginHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
    try {
      console.log('🔐 Login attempt started');
      const body = await c.req.json();
      const { email, password }: LoginRequest = body;

      if (!email || !password) {
        console.log('❌ Missing email or password');
        return c.json({
          success: false,
          error: 'Email e senha são obrigatórios'
        } as LoginResponse, 400);
      }

      console.log('📧 Login attempt for email:', email);
      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);
      const authHandler = new AuthService(d1Client, env);

      console.log('🔍 Attempting login...');
      const result = await authHandler.login({ email, password });
      console.log('✅ Login successful');

      // Gera o payload do JWT
      const jwtPayload = {
        userId: result.user.id,
        email: result.user.email,
        role: result.user.role,
        brand_name: result.user.brandName || null,
        brandId: result.user.brandId || null,
        permissions: [], // D1 não tem permissions separadas
        roles: [result.user.role], // Usar role como array
        sessionToken: result.sessionToken,
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 dias
      };

      // Assina o JWT
      const jwtToken = await sign(jwtPayload, env.JWT_SECRET);

      return c.json({
        success: true,
        data: {
          user: result.user,
          token: jwtToken,
          refreshToken: result.sessionToken,
        },
      } as LoginResponse);
    } catch (error) {
      console.error('❌ Login error:', error);
      
      // Tratar erros específicos
      if (error instanceof Error && error.message === 'Invalid credentials') {
        return c.json({
          success: false,
          error: 'Usuário ou senha inválidos'
        } as LoginResponse, 401);
      }
      
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno no servidor'
      } as LoginResponse, 500);
    }
  }

  /**
   * Handler para registro de novo usuário.
   * Cria um novo usuário no sistema.
   * @param c Contexto do Hono contendo as bindings do ambiente.
   * @returns Resposta JSON com sucesso ou erro.
   */
  static async registerHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
    try {
      const { email, password, brand_name, role }: RegisterRequest = await c.req.json();

      if (!email || !password || !brand_name) {
        return c.json({
          success: false,
          error: 'Email, senha e nome da marca são obrigatórios'
        } as RegisterResponse, 400);
      }

      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);
      const authHandler = new AuthService(d1Client);

      const user = await authHandler.register({
        email,
        password,
        brand_name,
        role: role || 'user',
      });

      if (!user) {
        return c.json({
          success: false,
          error: 'Falha ao registrar usuário'
        } as RegisterResponse, 400);
      }

      return c.json({
        success: true,
        user,
        message: 'Usuário registrado com sucesso',
      } as RegisterResponse);
    } catch (error) {
      if (error instanceof Error && error.message === 'User already exists') {
        return c.json({
          success: false,
          error: 'Usuário já existe'
        } as RegisterResponse, 409);
      }
      return c.json({
        success: false,
        error: 'Erro interno no servidor'
      } as RegisterResponse, 500);
    }
  }

  /**
   * Handler para retornar o perfil do usuário autenticado.
   * @param c Contexto do Hono contendo as variáveis do usuário.
   * @returns Resposta JSON com os dados do usuário e se possui acesso master.
   */
  static async profileHandler(c: Context<{
    Bindings: Env;
    Variables: { user: UserData; isMasterAccess: boolean; }
  }>): Promise<Response> {
    const user = c.get('user');
    const isMasterAccess = c.get('isMasterAccess');

    return c.json({
      success: true,
      user,
      isMasterAccess,
    } as ProfileResponse);
  }

  /**
   * Handler para atualização do perfil do usuário autenticado.
   * Permite alterar o nome da marca.
   * @param c Contexto do Hono contendo as variáveis do usuário.
   * @returns Resposta JSON com sucesso ou erro.
   */
  static async updateProfileHandler(c: Context<{
    Bindings: Env;
    Variables: { user: UserData; }
  }>): Promise<Response> {
    try {
      const user = c.get('user');
      const { brand_name } = await c.req.json();

      if (!brand_name) {
        return c.json({
          success: false,
          error: 'Nome da marca é obrigatório'
        }, 400);
      }

      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);

      const result = await d1Client.execute(
        'UPDATE users SET brand_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [brand_name, user.id]
      );

      if (!result.success) {
        return c.json({
          success: false,
          error: 'Falha ao atualizar perfil'
        }, 500);
      }

      return c.json({
        success: true,
        message: 'Perfil atualizado com sucesso',
      });
    } catch (error) {
      return c.json({
        success: false,
        error: 'Erro interno no servidor'
      }, 500);
    }
  }

  /**
   * Handler para logout do usuário.
   * Remove a sessão do banco de dados.
   * @param c Contexto do Hono contendo as bindings do ambiente.
   * @returns Resposta JSON com sucesso ou erro.
   */
  static async logoutHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
    try {
      const authHeader = c.req.header('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({
          success: false,
          error: 'Token não fornecido'
        }, 400);
      }

      const token = authHeader.substring(7);
      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);
      const authHandler = new AuthService(d1Client, env);

      await authHandler.logout(token);

      return c.json({
        success: true,
        message: 'Logout realizado com sucesso',
      });
    } catch (error) {
      console.error('❌ Logout handler error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Erro interno no servidor'
      }, 500);
    }
  }

  /**
   * Handler para atribuir um papel (role) a um usuário.
   * @param c Contexto do Hono contendo as variáveis do usuário.
   * @returns Resposta JSON com sucesso ou erro.
   */
  static async assignRoleHandler(c: Context<{
    Bindings: Env;
    Variables: { user: UserData; }
  }>): Promise<Response> {
    try {
      const userId = parseInt(c.req.param('id'));
      const { role, expiresAt } = await c.req.json();

      if (!role) {
        return c.json({
          success: false,
          error: 'Papel (role) é obrigatório'
        }, 400);
      }

      if (isNaN(userId)) {
        return c.json({
          success: false,
          error: 'ID de usuário inválido'
        }, 400);
      }

      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);
      const authHandler = new AuthService(d1Client);

      const expiry = expiresAt ? new Date(expiresAt) : undefined;
      const success = await authHandler.assignUserRole(userId, role, expiry);

      if (!success) {
        return c.json({
          success: false,
          error: 'Falha ao atribuir papel'
        }, 500);
      }

      return c.json({
        success: true,
        message: 'Papel atribuído com sucesso',
      });
    } catch (error) {
      return c.json({
        success: false,
        error: 'Erro interno no servidor'
      }, 500);
    }
  }

  /**
   * Handler para listar usuários do sistema.
   * Retorna até 50 usuários ordenados por ID decrescente.
   * @param c Contexto do Hono contendo as bindings do ambiente.
   * @returns Resposta JSON com a lista de usuários ou erro.
   */
  static async listUsersHandler(c: Context<{ Bindings: Env }>): Promise<Response> {
    try {
      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);

      const result = await d1Client.query(
        `SELECT id, email, brand_name, role, permissions, roles, created_at, updated_at 
         FROM users ORDER BY id DESC LIMIT 50`
      );

      if (!result.success) {
        return c.json({
          success: false,
          error: 'Falha ao buscar usuários'
        }, 500);
      }

      return c.json({
        success: true,
        users: result.result?.results || [],
      });
    } catch (error) {
      return c.json({
        success: false,
        error: 'Erro interno no servidor'
      }, 500);
    }
  }
}