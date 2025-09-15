import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { UserManagementService } from '../../services/UserManagementService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';
import { CloudflareD1Client } from '../../config/types/auth';

// Validation schemas
const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').optional(),
  name: z.string().min(1, 'Nome é obrigatório').optional(),
  firstName: z.string().min(1, 'Nome é obrigatório').optional(),
  lastName: z.string().min(1, 'Sobrenome é obrigatório').optional(),
  role: z.enum(['admin', 'editor-chefe', 'editor', 'revisor', 'user']).default('editor'),
  permissions: z.array(z.string()).optional(),
  brandId: z.string().optional(),
  brandName: z.string().optional(),
  bio: z.string().max(500).optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  isActive: z.boolean().optional().default(true),
  emailVerified: z.boolean().optional().default(false),
  sendWelcomeEmail: z.boolean().optional().default(true),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
  role: z.enum(['admin', 'editor-chefe', 'editor', 'revisor', 'user']).optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  brandId: z.string().optional(),
  brandName: z.string().optional(),
});

const listUsersSchema = z.object({
  search: z.string().optional(),
  role: z.string().optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  brandId: z.string().optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  lastLoginAfter: z.string().datetime().optional(),
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)).default('1'),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 20))).default('20'),
  sortBy: z.enum(['name', 'email', 'createdAt', 'lastLoginAt', 'loginCount']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória').optional(),
  newPassword: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

export class UserController {
  private app: Hono;
  private userService: UserManagementService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    
    // Criar cliente D1 para autenticação
    const d1Client = new CloudflareD1Client({
      databaseId: env.D1_DATABASE_ID || 'cms-db',
      accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
      apiToken: env.CLOUDFLARE_API_TOKEN || ''
    });
    
    this.userService = new UserManagementService(db, d1Client);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Listar usuários
    this.app.get('/', zValidator('query', listUsersSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admins e editores-chefe podem listar todos os usuários
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para listar usuários',
          }, 403);
        }

        const query = c.req.valid('query');

        // Parse dates
        const searchQuery = {
          ...query,
          createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
          createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
          lastLoginAfter: query.lastLoginAfter ? new Date(query.lastLoginAfter) : undefined,
        };

        console.log(`👥 Listing users for ${user.name} (${user.role})`);

        const result = await this.userService.listUsers(searchQuery);

        return c.json({
          success: true,
          data: result.users,
          pagination: result.pagination,
        });

      } catch (error) {
        console.error('Error listing users:', error);
        return c.json({
          success: false,
          error: 'Erro ao listar usuários',
        }, 500);
      }
    });

    // Criar novo usuário
    this.app.post('/', zValidator('json', createUserSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admins podem criar usuários
        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem criar usuários',
          }, 403);
        }

        const data = c.req.valid('json');

        console.log(`👤 Creating user: ${data.email} by admin ${user.name}`);

        const requestInfo = {
          ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
          userAgent: c.req.header('User-Agent') || 'unknown',
        };

        const result = await this.userService.createUser(data, user.id, requestInfo);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.user,
          }, 201);
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error creating user:', error);
        return c.json({
          success: false,
          error: 'Erro ao criar usuário',
        }, 500);
      }
    });

    // Obter usuário por ID
    this.app.get('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const id = c.req.param('id');

        // Usuários podem ver seus próprios dados, admins/editores-chefe podem ver qualquer usuário
        if (user.id !== id && !['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para ver este usuário',
          }, 403);
        }

        console.log(`👤 Getting user: ${id}`);

        const targetUser = await this.userService.getUserById(id);

        if (targetUser) {
          return c.json({
            success: true,
            data: targetUser,
          });
        } else {
          return c.json({
            success: false,
            error: 'Usuário não encontrado',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting user:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar usuário',
        }, 500);
      }
    });

    // Atualizar usuário
    this.app.put('/:id', zValidator('json', updateUserSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const id = c.req.param('id');
        const data = c.req.valid('json');

        // Usuários podem editar seus próprios dados (exceto role e isActive)
        // Admins podem editar qualquer usuário
        if (user.id !== id && user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para editar este usuário',
          }, 403);
        }

        // Se não é admin, não pode alterar role e isActive
        if (user.role !== 'admin') {
          delete data.role;
          delete data.isActive;
          delete data.permissions;
        }

        console.log(`✏️ Updating user: ${id} by ${user.name}`);

        const requestInfo = {
          ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
          userAgent: c.req.header('User-Agent') || 'unknown',
        };

        const result = await this.userService.updateUser(id, data, user.id, requestInfo);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.user,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error updating user:', error);
        return c.json({
          success: false,
          error: 'Erro ao atualizar usuário',
        }, 500);
      }
    });

    // Deletar/desativar usuário
    this.app.delete('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const id = c.req.param('id');
        const hardDelete = c.req.query('hard') === 'true';

        // Apenas admins podem deletar usuários
        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem remover usuários',
          }, 403);
        }

        // Não pode deletar a si mesmo
        if (user.id === id) {
          return c.json({
            success: false,
            error: 'Você não pode remover sua própria conta',
          }, 400);
        }

        console.log(`🗑️ ${hardDelete ? 'Deleting' : 'Deactivating'} user: ${id} by admin ${user.name}`);

        const requestInfo = {
          ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
          userAgent: c.req.header('User-Agent') || 'unknown',
        };

        const result = await this.userService.deleteUser(id, user.id, requestInfo, !hardDelete);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error deleting user:', error);
        return c.json({
          success: false,
          error: 'Erro ao remover usuário',
        }, 500);
      }
    });

    // Atualizar senha
    this.app.put('/:id/password', zValidator('json', updatePasswordSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const id = c.req.param('id');
        const { currentPassword, newPassword } = c.req.valid('json');

        // Apenas o próprio usuário ou admins podem alterar senha
        if (user.id !== id && user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para alterar senha deste usuário',
          }, 403);
        }

        // Se não é admin, deve fornecer senha atual
        if (user.id === id && !currentPassword) {
          return c.json({
            success: false,
            error: 'Senha atual é obrigatória',
          }, 400);
        }

        // Verificar senha atual se fornecida
        if (currentPassword) {
          const isCurrentValid = await this.userService.verifyPassword(id, currentPassword);
          if (!isCurrentValid) {
            return c.json({
              success: false,
              error: 'Senha atual incorreta',
            }, 400);
          }
        }

        console.log(`🔒 Changing password for user: ${id}`);

        const requestInfo = {
          ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
          userAgent: c.req.header('User-Agent') || 'unknown',
        };

        const result = await this.userService.updatePassword(id, newPassword, user.id, requestInfo);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error updating password:', error);
        return c.json({
          success: false,
          error: 'Erro ao alterar senha',
        }, 500);
      }
    });

    // Obter perfil do usuário atual
    this.app.get('/me/profile', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`👤 Getting profile for user: ${user.id}`);

        const profile = await this.userService.getUserById(user.id);

        if (profile) {
          return c.json({
            success: true,
            data: profile,
          });
        } else {
          return c.json({
            success: false,
            error: 'Perfil não encontrado',
          }, 404);
        }

      } catch (error) {
        console.error('Error getting user profile:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar perfil',
        }, 500);
      }
    });

    // Atualizar perfil do usuário atual
    this.app.put('/me/profile', zValidator('json', updateProfileSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const data = c.req.valid('json');

        console.log(`✏️ Updating profile for user: ${user.id}`);

        const requestInfo = {
          ip: c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown',
          userAgent: c.req.header('User-Agent') || 'unknown',
        };

        const result = await this.userService.updateUser(user.id, data, user.id, requestInfo);

        if (result.success) {
          return c.json({
            success: true,
            message: 'Perfil atualizado com sucesso',
            data: result.user,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error updating user profile:', error);
        return c.json({
          success: false,
          error: 'Erro ao atualizar perfil',
        }, 500);
      }
    });

    // Obter estatísticas de usuários (apenas admin)
    this.app.get('/stats/overview', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem ver estatísticas de usuários',
          }, 403);
        }

        console.log(`📊 Getting user stats for admin ${user.name}`);

        const stats = await this.userService.getUserStats();

        return c.json({
          success: true,
          data: stats,
        });

      } catch (error) {
        console.error('Error getting user stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar estatísticas',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        const user = c.get('user');
        const stats = await this.userService.getUserStats();

        return c.json({
          success: true,
          service: 'user-management',
          status: 'healthy',
          data: {
            totalUsers: stats.totalUsers,
            activeUsers: stats.activeUsers,
            recentRegistrations: stats.recentRegistrations,
            userRole: user?.role,
          },
        });

      } catch (error) {
        console.error('User management health check failed:', error);
        return c.json({
          success: false,
          service: 'user-management',
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
      }
    });
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}