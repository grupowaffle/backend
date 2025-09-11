import { CloudflareD1Client } from '../lib/cloudflareD1Client';
import { LoginCredentials, RegisterData } from '../config/types/auth';
import { UserData } from '../config/types/common';

/**
 * Serviço de autenticação responsável por gerenciar sessões, login, registro e papéis de usuários.
 */
export class AuthService {
  private d1Client: CloudflareD1Client;

  /**
   * Cria uma instância do serviço de autenticação.
   * @param d1Client Instância do cliente Cloudflare D1 para operações no banco de dados.
   */
  constructor(d1Client: CloudflareD1Client) {
    this.d1Client = d1Client;
  }

  /**
   * Valida uma sessão de usuário a partir do token de sessão.
   * @param sessionToken Token da sessão a ser validada.
   * @returns Dados do usuário se a sessão for válida, ou null caso contrário.
   */
  async validateSession(sessionToken: string): Promise<UserData | null> {
    try {
      const result = await this.d1Client.query(
        `SELECT s.*, u.id as user_id, u.email, u.display_name, u.username
         FROM user_sessions s 
         JOIN users u ON s.user_id = u.id 
         WHERE s.id = ? AND s.expires_at > datetime('now')`,
        [sessionToken]
      );

      if (!result.success || !result.result?.results?.length) {
        return null;
      }

      const session = result.result.results[0];
      
      // Busca os roles e permissions do usuário
      const rolesResult = await this.d1Client.query(
        `SELECT r.name, r.permissions 
         FROM user_roles ur 
         JOIN roles r ON ur.role_id = r.id 
         WHERE ur.user_id = ? AND ur.is_active = TRUE`,
        [session.user_id]
      );

      let roles: string[] = [];
      let permissions: string[] = [];
      
      if (rolesResult.success && rolesResult.result?.results?.length) {
        rolesResult.result.results.forEach((role: any) => {
          roles.push(role.name);
          if (role.permissions) {
            try {
              const rolePerms = JSON.parse(role.permissions);
              if (Array.isArray(rolePerms)) {
                permissions.push(...rolePerms);
              }
            } catch {
              // Ignore parsing errors
            }
          }
        });
      }

      return {
        id: session.user_id,
        email: session.email,
        role: roles.length > 0 ? roles[0] : 'user',
        brand_name: session.display_name || session.username || session.email.split('@')[0],
        brandId: session.user_id,
        permissions: [...new Set(permissions)], // Remove duplicates
        roles: roles
      };
    } catch (error) {
      // Em caso de erro, retorna null para indicar sessão inválida
      console.error('Erro ao validar sessão:', error);
      return null;
    }
  }

  /**
   * Realiza o login do usuário, validando as credenciais e criando uma nova sessão.
   * @param credentials Credenciais de login (email e senha).
   * @returns Dados do usuário e token de sessão se o login for bem-sucedido, ou null caso contrário.
   */
  async login(credentials: LoginCredentials): Promise<{ user: UserData; sessionToken: string; jwtToken?: string } | null> {
    try {
      // Busca o usuário pelo email, incluindo credenciais e papéis
      const userResult = await this.d1Client.query(`
        SELECT u.*, c.password_hash, c.salt,
               GROUP_CONCAT(r.name) as roles_list,
               GROUP_CONCAT(r.permissions) as permissions_list
        FROM users u
        LEFT JOIN user_credentials c ON u.id = c.user_id
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        WHERE u.email = ?
        GROUP BY u.id
      `, [credentials.email]);

      if (!userResult.success) {
        return null;
      }

      if (!userResult.result?.results?.length) {
        return null;
      }

      const user = userResult.result.results[0];

      // Verifica se existe hash de senha e salt
      if (!user.password_hash || !user.salt) {
        return null;
      }

      // Valida a senha informada utilizando o salt armazenado
      const isValidPassword = await this.verifyPasswordWithSalt(credentials.password, user.password_hash, user.salt);

      if (!isValidPassword) {
        return null;
      }

      // Gera um novo token de sessão válido por 30 dias
      const sessionToken = this.generateSessionToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 dias

      // Cria a sessão no banco de dados
      await this.d1Client.execute(
        `INSERT INTO user_sessions (id, user_id, expires_at) VALUES (?, ?, ?)`,
        [sessionToken, user.id, expiresAt.toISOString()]
      );

      // Processa os papéis e permissões do usuário
      const rolesList = user.roles_list ? user.roles_list.split(',').filter(Boolean) : [];
      const permissionsList = user.permissions_list ? user.permissions_list.split(',').filter(Boolean) : [];

      // Normaliza as permissões, tratando possíveis arrays em formato JSON
      const allPermissions: string[] = [];
      permissionsList.forEach((permStr: string) => {
        if (!permStr) return;
        try {
          const perms = JSON.parse(permStr);
          if (Array.isArray(perms)) {
            allPermissions.push(...perms);
          } else if (typeof perms === 'string') {
            allPermissions.push(perms);
          }
        } catch {
          // Caso não seja JSON válido, trata como string simples
          const cleanPerm = permStr.trim()
            .replace(/^\[?"?/, '')
            .replace(/"?\]?$/, '')
            .replace(/\\"/g, '"')
            .trim();

          if (cleanPerm) {
            if (cleanPerm.includes(',')) {
              cleanPerm.split(',').forEach(p => {
                const cleaned = p.trim().replace(/^"/, '').replace(/"$/, '').trim();
                if (cleaned) allPermissions.push(cleaned);
              });
            } else {
              allPermissions.push(cleanPerm);
            }
          }
        }
      });

      // Monta o objeto de dados do usuário autenticado
      const userData: UserData = {
        id: user.id,
        email: user.email,
        role: rolesList.length > 0 ? rolesList[0] : 'user', // Papel principal
        brand_name: user.display_name || user.email.split('@')[0],
        brandId: user.id,
        permissions: [...new Set(allPermissions)], // Remove duplicatas
        roles: rolesList
      };

      return {
        user: userData,
        sessionToken,
      };
    } catch (error) {
      // Em caso de erro, retorna null para indicar falha no login
      console.error('Erro durante o login:', error);
      return null;
    }
  }

  /**
   * Realiza o registro de um novo usuário.
   * @param userData Dados do usuário a ser registrado.
   * @returns Dados do usuário criado ou null em caso de erro.
   */
  async register(userData: RegisterData): Promise<UserData | null> {
    try {
      // Verifica se já existe um usuário com o mesmo email
      const existingUser = await this.d1Client.query(
        'SELECT id FROM users WHERE email = ?',
        [userData.email]
      );

      if (existingUser.success && existingUser.result?.results?.length) {
        throw new Error('Usuário já existe');
      }

      // Gera o hash da senha do usuário
      const passwordHash = await this.hashPassword(userData.password);

      // Insere o novo usuário no banco de dados
      const result = await this.d1Client.execute(
        `INSERT INTO users (email, password_hash, brand_name, role, permissions, roles) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userData.email,
          passwordHash,
          userData.brand_name,
          userData.role || 'user',
          JSON.stringify([]),
          JSON.stringify([userData.role || 'user'])
        ]
      );

      if (!result.success) {
        return null;
      }

      // Busca o usuário recém-criado para retornar seus dados
      const newUserResult = await this.d1Client.query(
        'SELECT * FROM users WHERE email = ?',
        [userData.email]
      );

      if (!newUserResult.success || !newUserResult.result?.results?.length) {
        return null;
      }

      const newUser = newUserResult.result.results[0];
      return {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        brand_name: newUser.brand_name,
        brandId: newUser.brand_id,
        permissions: newUser.permissions ? JSON.parse(newUser.permissions) : [],
        roles: newUser.roles ? JSON.parse(newUser.roles) : []
      };
    } catch (error) {
      // Em caso de erro, retorna null para indicar falha no registro
      console.error('Erro durante o registro:', error);
      return null;
    }
  }

  /**
   * Atribui um papel (role) a um usuário, podendo definir uma data de expiração.
   * @param userId ID do usuário.
   * @param role Papel a ser atribuído.
   * @param expiresAt Data de expiração do papel (opcional).
   * @returns true se o papel foi atribuído com sucesso, false caso contrário.
   */
  async assignUserRole(userId: number, role: string, expiresAt?: Date): Promise<boolean> {
    try {
      // Busca os papéis atuais do usuário
      const userResult = await this.d1Client.query(
        'SELECT roles FROM users WHERE id = ?',
        [userId]
      );

      if (!userResult.success || !userResult.result?.results?.length) {
        return false;
      }

      const user = userResult.result.results[0];
      const currentRoles = user.roles ? JSON.parse(user.roles) : [];
      
      if (!currentRoles.includes(role)) {
        currentRoles.push(role);
      }

      // Atualiza os papéis do usuário
      await this.d1Client.execute(
        'UPDATE users SET roles = ? WHERE id = ?',
        [JSON.stringify(currentRoles), userId]
      );

      // Se houver data de expiração, registra a expiração do papel
      if (expiresAt) {
        await this.d1Client.execute(
          `INSERT INTO user_role_expirations (user_id, role, expires_at) VALUES (?, ?, ?)
           ON CONFLICT(user_id, role) DO UPDATE SET expires_at = excluded.expires_at`,
          [userId, role, expiresAt.toISOString()]
        );
      }

      return true;
    } catch (error) {
      // Em caso de erro, retorna false para indicar falha na atribuição
      console.error('Erro ao atribuir papel ao usuário:', error);
      return false;
    }
  }

  /**
   * Remove um papel (role) de um usuário.
   * @param userId ID do usuário.
   * @param role Papel a ser removido.
   * @returns true se o papel foi removido com sucesso, false caso contrário.
   */
  async removeUserRole(userId: number, role: string): Promise<boolean> {
    try {
      // Busca os papéis atuais do usuário
      const userResult = await this.d1Client.query(
        'SELECT roles FROM users WHERE id = ?',
        [userId]
      );

      if (!userResult.success || !userResult.result?.results?.length) {
        return false;
      }

      const user = userResult.result.results[0];
      const currentRoles = user.roles ? JSON.parse(user.roles) : [];
      const updatedRoles = currentRoles.filter((r: string) => r !== role);

      // Atualiza os papéis do usuário
      await this.d1Client.execute(
        'UPDATE users SET roles = ? WHERE id = ?',
        [JSON.stringify(updatedRoles), userId]
      );

      // Remove a expiração do papel, se existir
      await this.d1Client.execute(
        'DELETE FROM user_role_expirations WHERE user_id = ? AND role = ?',
        [userId, role]
      );

      return true;
    } catch (error) {
      // Em caso de erro, retorna false para indicar falha na remoção
      console.error('Erro ao remover papel do usuário:', error);
      return false;
    }
  }

  /**
   * Realiza o logout do usuário, removendo a sessão do banco de dados.
   * @param sessionToken Token da sessão a ser encerrada.
   * @returns true se a sessão foi removida com sucesso, false caso contrário.
   */
  async logout(sessionToken: string): Promise<boolean> {
    try {
      const result = await this.d1Client.execute(
        'DELETE FROM user_sessions WHERE id = ?',
        [sessionToken]
      );
      return result.success;
    } catch (error) {
      // Em caso de erro, retorna false para indicar falha no logout
      console.error('Erro durante o logout:', error);
      return false;
    }
  }

  /**
   * Gera um token de sessão único.
   * @returns Token de sessão.
   */
  private generateSessionToken(): string {
    return crypto.randomUUID() + '-' + Date.now();
  }

  /**
   * Gera o hash da senha utilizando SHA-256.
   * @param password Senha em texto puro.
   * @returns Hash da senha.
   */
  private async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifica se a senha informada corresponde ao hash armazenado, utilizando o salt.
   * @param password Senha em texto puro.
   * @param storedHash Hash da senha armazenado.
   * @param salt Salt utilizado na geração do hash.
   * @returns true se a senha for válida, false caso contrário.
   */
  private async verifyPasswordWithSalt(password: string, storedHash: string, salt: string): Promise<boolean> {
    try {
      // Concatena a senha com o salt e gera o hash para comparação
      const encoder = new TextEncoder();
      const combinedString = password + salt;
      const data = encoder.encode(combinedString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedInput = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashedInput === storedHash;
    } catch (error) {
      // Em caso de erro, retorna false para indicar falha na verificação
      console.error('Erro na verificação da senha:', error);
      return false;
    }
  }
}