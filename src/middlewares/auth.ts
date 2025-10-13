import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { Env, UserData } from '../config/types/common';
import { AuthService } from '../services/authService';
import { JWTPayload, CloudflareD1Client } from '../config/types/auth';
import { D1RoleService } from '../services/D1RoleService';

/**
 * Extensão do Context do Hono para incluir variáveis de usuário e acesso master.
 */
declare module 'hono' {
  interface ContextVariableMap {
    user: import('../config/types/common').UserData;
    isMasterAccess: boolean;
  }
}

/**
 * Middleware de autenticação unificado.
 * 
 * - Aceita tokens JWT, token de desenvolvimento e master password.
 * - Valida sessões no banco D1 se necessário.
 * - Define o usuário autenticado e se ele possui acesso master no contexto.
 * 
 * @param c Contexto do Hono
 * @param next Próxima função do middleware
 */
export const authMiddleware = async (
  c: Context<{ Bindings: Env; Variables: { user: UserData; isMasterAccess: boolean } }>,
  next: Next
) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ message: 'Token de autorização obrigatório' }, 401);
  }

  const token = authHeader.substring(7);
  const env = c.env;

  // Token de desenvolvimento (bypass total)
  if (token === env.DEV_TOKEN) {
    const devUser: UserData = {
      id: 'dev',
      email: 'dev@localhost',
      name: 'Developer',
      role: 'developer',
      brand_name: 'Development',
      brandId: 0,
      permissions: ['*'],
      roles: ['developer', 'admin']
    };
    c.set('user', devUser);
    c.set('isMasterAccess', true);
    return next();
  }

  // Master password (bypass total)
  if (token === env.MASTER_PASSWORD) {
    const masterUser: UserData = {
      id: 'master',
      email: 'master@system',
      name: 'Master User',
      role: 'master',
      brand_name: 'System',
      brandId: 0,
      permissions: ['*'],
      roles: ['master']
    };
    c.set('user', masterUser);
    c.set('isMasterAccess', true);
    return next();
  }

  try {
    // Validação do JWT
    const payload = await verify(token, env.JWT_SECRET) as JWTPayload;

    // Verifica expiração do token
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return c.json({ message: 'Token expirado' }, 401);
    }

    let user: UserData;
    let isMasterAccess = false;

    // Token de acesso master
    if (payload.isMasterAccess) {
      user = {
        id: payload.userId || 'master',
        email: payload.email || 'master@system',
        name: payload.name || 'Master User',
        role: 'master',
        brand_name: payload.brand_name || 'System',
        brandId: payload.brandId || 0,
        permissions: ['*'],
        roles: ['master']
      };
      isMasterAccess = true;
    } else {
      user = {
        id: payload.userId || '',
        email: payload.email || '',
        name: payload.name || '',
        role: payload.role || 'user',
        brand_name: payload.brand_name || '',
        brandId: payload.brandId || 0,
        permissions: payload.permissions || [],
        roles: payload.roles || []
      };
      isMasterAccess = user.permissions?.includes('*') || user.role === 'master';
    }

    // Se o JWT contiver sessionToken válido (não placeholder), valida a sessão no D1
    if (payload.sessionToken && payload.sessionToken !== 'd1-session-token') {
      const d1Client = new CloudflareD1Client({
        accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
        databaseId: env.CLOUDFLARE_D1_DATABASE_ID || '',
        apiToken: env.CLOUDFLARE_API_TOKEN || '',
      });

      const authHandler = new AuthService(d1Client, env);
      const sessionUser = await authHandler.validateSession(payload.sessionToken);

      if (!sessionUser) {
        return c.json({ message: 'Sessão inválida' }, 401);
      }

      // Dados da sessão sobrescrevem os do JWT
      user = {
        ...user,
        ...sessionUser
      };
    } else if (payload.sessionToken === 'd1-session-token') {
      // Para sessionToken placeholder, buscar dados atualizados do usuário no D1
      const d1Client = new CloudflareD1Client({
        accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
        databaseId: env.CLOUDFLARE_D1_DATABASE_ID || '',
        apiToken: env.CLOUDFLARE_API_TOKEN || '',
      });

      try {
        // Buscar dados atualizados do usuário com role
        const roleService = new D1RoleService(d1Client);
        const userWithRole = await roleService.getUserWithRole(payload.userId);

        if (userWithRole) {
          console.log('🔧 [AUTH MIDDLEWARE] Dados do usuário do D1:', {
            id: userWithRole.id,
            email: userWithRole.email,
            name: userWithRole.name,
            role: userWithRole.role,
            permissions: userWithRole.permissions,
            roles: userWithRole.roles,
            allRoles: userWithRole.allRoles,
            cmsRole: userWithRole.cmsRole
          });
          
          // Atualizar usuário com dados do D1 incluindo role e permissões
          user = {
            ...user,
            id: userWithRole.id,
            email: userWithRole.email,
            name: userWithRole.name,
            role: userWithRole.role,
            brand_name: userWithRole.brand_name,
            brandId: userWithRole.brandId,
            permissions: userWithRole.permissions || [],
            roles: userWithRole.roles || []
          };
          
          console.log('🔧 [AUTH MIDDLEWARE] Usuário final configurado:', {
            id: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
            roles: user.roles
          });
        }
      } catch (error) {
        console.error('❌ Erro ao buscar dados atualizados do usuário:', error);
        // Continuar com os dados do JWT se houver erro
      }
    }

    c.set('user', user);
    c.set('isMasterAccess', isMasterAccess);
    return next();

  } catch (jwtError) {
    // Fallback: tenta validar o token como sessionToken no D1
    try {
      const d1Client = new CloudflareD1Client({
        accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
        databaseId: env.CLOUDFLARE_D1_DATABASE_ID || '',
        apiToken: env.CLOUDFLARE_API_TOKEN || '',
      });

      const authHandler = new AuthService(d1Client, env);
      const sessionUser = await authHandler.validateSession(token);

      if (sessionUser) {
        // Buscar dados completos do usuário com role
        const roleService = new D1RoleService(d1Client);
        const userWithRole = await roleService.getUserWithRole(sessionUser.id);

        if (userWithRole) {
          c.set('user', userWithRole);
          c.set('isMasterAccess', userWithRole.role === 'master' || userWithRole.permissions?.includes('*'));
          return next();
        } else {
          // Fallback para dados básicos se não conseguir buscar role
          c.set('user', sessionUser);
          c.set('isMasterAccess', sessionUser.role === 'master' || sessionUser.permissions?.includes('*'));
          return next();
        }
      }
    } catch (sessionError) {
      // Silencia erros de validação de sessão
    }

    return c.json({ message: 'Token inválido ou expirado' }, 401);
  }
};

/**
 * Middleware para verificação de roles.
 * 
 * Permite acesso se o usuário possuir algum dos roles permitidos, ou se for admin/super_admin/master.
 * Usuários com acesso master sempre passam.
 * 
 * @param allowedRoles Array de roles permitidos
 */
export const roleMiddleware = (allowedRoles: string[]) => {
  return async (
    c: Context<{ Bindings: Env; Variables: { user: UserData; isMasterAccess: boolean } }>,
    next: Next
  ) => {
    const user = c.get('user');
    const isMasterAccess = c.get('isMasterAccess');

    if (!user) {
      return c.json({ message: 'Não autorizado - Usuário não encontrado' }, 401);
    }

    // Acesso master ignora checagem de roles
    if (isMasterAccess) {
      return next();
    }

    if (!user.role && (!user.roles || user.roles.length === 0)) {
      return c.json({ message: 'Não autorizado - Role não encontrado' }, 401);
    }

    const userRoles = user.roles || [user.role];
    const hasRequiredRole = allowedRoles.some(role =>
      userRoles.includes(role) ||
      userRoles.includes('admin') ||
      userRoles.includes('super_admin') ||
      userRoles.includes('master')
    );

    if (!hasRequiredRole) {
      return c.json({
        message: 'Não autorizado - Permissão insuficiente',
        required: allowedRoles,
        userRoles: userRoles
      }, 403);
    }

    return next();
  };
};

/**
 * Middleware para verificação de permissões.
 * 
 * Permite acesso se o usuário possuir todas as permissões necessárias.
 * Aceita curingas (ex: 'users.*' cobre 'users.read', 'users.write').
 * Usuários com acesso master ou permissão '*' sempre passam.
 * 
 * @param requiredPermissions Permissão ou array de permissões necessárias
 */
export const permissionMiddleware = (requiredPermissions: string | string[]) => {
  return async (
    c: Context<{ Bindings: Env; Variables: { user: UserData; isMasterAccess: boolean } }>,
    next: Next
  ) => {
    const user = c.get('user');
    const isMasterAccess = c.get('isMasterAccess');

    if (!user) {
      return c.json({ message: 'Não autorizado - Usuário não encontrado' }, 401);
    }

    // Acesso master ou permissão global ignora checagem
    if (isMasterAccess || user.permissions?.includes('*')) {
      return next();
    }

    const permissions = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
    const userPermissions = user.permissions || [];

    const hasPermission = permissions.every(permission => {
      // Checagem exata
      if (userPermissions.includes(permission)) {
        return true;
      }

      // Checagem de curingas (ex: 'users.*' cobre 'users.read')
      const wildcardMatch = userPermissions.some(userPerm => {
        if (userPerm.endsWith('.*')) {
          const basePermission = userPerm.slice(0, -2);
          return permission.startsWith(basePermission + '.');
        }
        return false;
      });

      return wildcardMatch;
    });

    if (!hasPermission) {
      return c.json({
        message: 'Não autorizado - Permissões insuficientes',
        required: permissions,
        userPermissions: userPermissions
      }, 403);
    }

    return next();
  };
};

/**
 * Middleware combinado para roles e permissões.
 * 
 * Primeiro verifica roles, depois permissões.
 * 
 * @param allowedRoles Array de roles permitidos
 * @param requiredPermissions Permissão ou array de permissões necessárias
 */
export const roleAndPermissionMiddleware = (
  allowedRoles: string[],
  requiredPermissions: string | string[]
) => {
  return async (
    c: Context<{ Bindings: Env; Variables: { user: UserData; isMasterAccess: boolean } }>,
    next: Next
  ) => {
    // Primeiro verifica roles
    const roleCheck = roleMiddleware(allowedRoles);
    try {
      await roleCheck(c, async () => {});
    } catch (error) {
      return c.json({ message: 'Não autorizado - Role insuficiente' }, 403);
    }

    // Depois verifica permissões
    const permissionCheck = permissionMiddleware(requiredPermissions);
    return permissionCheck(c, next);
  };
};