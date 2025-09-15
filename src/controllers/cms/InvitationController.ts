import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { InvitationService } from '../../services/InvitationService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const inviteUserSchema = z.object({
  email: z.string().email('Email inválido'),
  role: z.enum(['admin', 'editor-chefe', 'editor', 'revisor', 'user']).default('editor'),
  permissions: z.array(z.string()).optional(),
  brandId: z.string().optional(),
  brandName: z.string().optional(),
  message: z.string().max(500).optional(),
  expiresInDays: z.number().min(1).max(30).optional().default(7),
});

const acceptInvitationSchema = z.object({
  inviteToken: z.string().min(1, 'Token de convite é obrigatório'),
  firstName: z.string().min(1, 'Nome é obrigatório').max(50),
  lastName: z.string().min(1, 'Sobrenome é obrigatório').max(50),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  confirmPassword: z.string().min(1, 'Confirmação de senha é obrigatória'),
  timezone: z.string().optional(),
  language: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Senhas não coincidem',
  path: ['confirmPassword'],
});

const listInvitationsSchema = z.object({
  status: z.enum(['pending', 'accepted', 'expired', 'revoked']).optional(),
  invitedBy: z.string().optional(),
  page: z.string().transform(val => Math.max(1, parseInt(val) || 1)).default('1'),
  limit: z.string().transform(val => Math.min(100, Math.max(1, parseInt(val) || 20))).default('20'),
  includeExpired: z.boolean().optional().default(true),
});

const completeOnboardingStepSchema = z.object({
  stepId: z.string().min(1, 'Step ID é obrigatório'),
});

export class InvitationController {
  private app: Hono;
  private invitationService: InvitationService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.invitationService = new InvitationService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para rotas protegidas
    this.app.use('/list', authMiddleware);
    this.app.use('/invite', authMiddleware);
    this.app.use('/revoke/*', authMiddleware);
    this.app.use('/onboarding/*', authMiddleware);

    // Listar convites (admins e editores-chefe)
    this.app.get('/list', zValidator('query', listInvitationsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admins e editores-chefe podem ver todos os convites
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para listar convites',
          }, 403);
        }

        const options = c.req.valid('query');

        console.log(`📧 Listing invitations for ${user.name} (${user.role})`);

        const result = await this.invitationService.listInvitations({
          ...options,
          // Editores-chefe só podem ver convites que eles fizeram
          invitedBy: user.role === 'editor-chefe' ? user.id : options.invitedBy,
        });

        return c.json({
          success: true,
          data: result.invitations,
          pagination: result.pagination,
        });

      } catch (error) {
        console.error('Error listing invitations:', error);
        return c.json({
          success: false,
          error: 'Erro ao listar convites',
        }, 500);
      }
    });

    // Convidar usuário
    this.app.post('/invite', zValidator('json', inviteUserSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admins e editores-chefe podem convidar
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem convidar usuários',
          }, 403);
        }

        const data = c.req.valid('json');

        // Editores-chefe não podem convidar admins ou outros editores-chefe
        if (user.role === 'editor-chefe' && ['admin', 'editor-chefe'].includes(data.role)) {
          return c.json({
            success: false,
            error: 'Editores-chefe não podem convidar administradores ou outros editores-chefe',
          }, 403);
        }

        console.log(`📧 Inviting user: ${data.email} by ${user.name} (${user.role})`);

        const result = await this.invitationService.inviteUser(
          data,
          user.id,
          user.name || user.email
        );

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: {
              invitation: result.invitation,
              inviteUrl: result.inviteUrl,
            },
          }, 201);
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error inviting user:', error);
        return c.json({
          success: false,
          error: 'Erro ao enviar convite',
        }, 500);
      }
    });

    // Obter detalhes do convite por token (público)
    this.app.get('/details/:token', async (c) => {
      try {
        const token = c.req.param('token');

        console.log(`🔍 Getting invitation details for token: ${token.substring(0, 8)}...`);

        const invitation = await this.invitationService.getInvitationByToken(token);

        if (!invitation) {
          return c.json({
            success: false,
            error: 'Convite não encontrado',
          }, 404);
        }

        if (invitation.isExpired) {
          return c.json({
            success: false,
            error: 'Este convite expirou',
          }, 400);
        }

        if (!invitation.isPending) {
          return c.json({
            success: false,
            error: 'Este convite já foi utilizado ou revogado',
          }, 400);
        }

        // Retornar apenas informações seguras
        return c.json({
          success: true,
          data: {
            email: invitation.email,
            role: invitation.role,
            brandName: invitation.brandName,
            invitedByName: invitation.invitedByName,
            message: invitation.message,
            expiresAt: invitation.expiresAt,
          },
        });

      } catch (error) {
        console.error('Error getting invitation details:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar detalhes do convite',
        }, 500);
      }
    });

    // Aceitar convite (público)
    this.app.post('/accept', zValidator('json', acceptInvitationSchema), async (c) => {
      try {
        const data = c.req.valid('json');

        console.log(`✅ Accepting invitation for token: ${data.inviteToken.substring(0, 8)}...`);

        const result = await this.invitationService.acceptInvitation(data);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: {
              user: result.user,
              token: result.token,
            },
          }, 201);
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error accepting invitation:', error);
        return c.json({
          success: false,
          error: 'Erro ao aceitar convite',
        }, 500);
      }
    });

    // Revogar convite
    this.app.delete('/revoke/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Apenas admins e editores-chefe podem revogar
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para revogar convites',
          }, 403);
        }

        const invitationId = c.req.param('id');

        console.log(`🚫 Revoking invitation: ${invitationId} by ${user.name}`);

        const result = await this.invitationService.revokeInvitation(invitationId, user.id);

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
        console.error('Error revoking invitation:', error);
        return c.json({
          success: false,
          error: 'Erro ao revogar convite',
        }, 500);
      }
    });

    // Obter progresso do onboarding
    this.app.get('/onboarding/progress', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`📋 Getting onboarding progress for user: ${user.id}`);

        const progress = await this.invitationService.getOnboardingProgress(user.id);

        return c.json({
          success: true,
          data: progress,
        });

      } catch (error) {
        console.error('Error getting onboarding progress:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar progresso do onboarding',
        }, 500);
      }
    });

    // Completar step do onboarding
    this.app.post('/onboarding/complete-step', zValidator('json', completeOnboardingStepSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { stepId } = c.req.valid('json');

        console.log(`✅ Completing onboarding step: ${stepId} for user: ${user.id}`);

        const result = await this.invitationService.completeOnboardingStep(user.id, stepId);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: result.progress,
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error completing onboarding step:', error);
        return c.json({
          success: false,
          error: 'Erro ao completar step do onboarding',
        }, 500);
      }
    });

    // Finalizar onboarding
    this.app.post('/onboarding/complete', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`🎉 Completing onboarding for user: ${user.id}`);

        const result = await this.invitationService.completeOnboarding(user.id);

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
        console.error('Error completing onboarding:', error);
        return c.json({
          success: false,
          error: 'Erro ao finalizar onboarding',
        }, 500);
      }
    });

    // Limpeza de convites expirados (cron job)
    this.app.post('/cleanup-expired', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem executar limpeza',
          }, 403);
        }

        console.log(`🧹 Cleaning up expired invitations by admin ${user.name}`);

        const result = await this.invitationService.cleanupExpiredInvitations();

        return c.json({
          success: true,
          message: `Limpeza concluída: ${result.cleaned} convites expirados processados`,
          data: result,
        });

      } catch (error) {
        console.error('Error cleaning up expired invitations:', error);
        return c.json({
          success: false,
          error: 'Erro na limpeza de convites',
        }, 500);
      }
    });

    // Reenviar convite
    this.app.post('/resend/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Permissão insuficiente para reenviar convites',
          }, 403);
        }

        const invitationId = c.req.param('id');

        // Buscar convite original
        const invitations = await this.invitationService.listInvitations({
          page: 1,
          limit: 1000,
        });

        const originalInvitation = invitations.invitations.find(inv => inv.id === invitationId);

        if (!originalInvitation) {
          return c.json({
            success: false,
            error: 'Convite não encontrado',
          }, 404);
        }

        if (!originalInvitation.isPending && !originalInvitation.isExpired) {
          return c.json({
            success: false,
            error: 'Apenas convites pendentes ou expirados podem ser reenviados',
          }, 400);
        }

        console.log(`📧 Resending invitation to: ${originalInvitation.email}`);

        // Revogar convite antigo se ainda estiver pendente
        if (originalInvitation.isPending) {
          await this.invitationService.revokeInvitation(invitationId, user.id);
        }

        // Criar novo convite
        const result = await this.invitationService.inviteUser(
          {
            email: originalInvitation.email,
            role: originalInvitation.role,
            permissions: originalInvitation.permissions,
            brandId: originalInvitation.brandId,
            brandName: originalInvitation.brandName,
            message: originalInvitation.message,
            expiresInDays: 7,
          },
          user.id,
          user.name || user.email
        );

        if (result.success) {
          return c.json({
            success: true,
            message: 'Convite reenviado com sucesso',
            data: {
              invitation: result.invitation,
              inviteUrl: result.inviteUrl,
            },
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error resending invitation:', error);
        return c.json({
          success: false,
          error: 'Erro ao reenviar convite',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        const invitations = await this.invitationService.listInvitations({
          page: 1,
          limit: 1,
        });

        return c.json({
          success: true,
          service: 'invitations',
          status: 'healthy',
          data: {
            totalInvitations: invitations.total,
            onboardingStepsCount: 5,
            defaultExpirationDays: 7,
          },
        });

      } catch (error) {
        console.error('Invitation service health check failed:', error);
        return c.json({
          success: false,
          service: 'invitations',
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