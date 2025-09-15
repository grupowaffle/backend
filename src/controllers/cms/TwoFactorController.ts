import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { TwoFactorAuthService } from '../../services/TwoFactorAuthService';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const setupTwoFactorSchema = z.object({
  appName: z.string().optional().default('TheNews CMS'),
});

const enableTwoFactorSchema = z.object({
  verificationCode: z.string().min(6, 'Código deve ter pelo menos 6 caracteres').max(9),
});

const verifyTwoFactorSchema = z.object({
  code: z.string().min(6, 'Código deve ter pelo menos 6 caracteres').max(9),
});

const disableTwoFactorSchema = z.object({
  verificationCode: z.string().min(6, 'Código de verificação é obrigatório').max(9),
});

const regenerateBackupCodesSchema = z.object({
  verificationCode: z.string().min(6, 'Código de verificação é obrigatório').max(9),
});

const resetTwoFactorSchema = z.object({
  userId: z.string().min(1, 'User ID é obrigatório'),
});

export class TwoFactorController {
  private app: Hono;
  private twoFactorService: TwoFactorAuthService;

  constructor(env: Env) {
    this.app = new Hono();
    const db = getDrizzleClient(env);
    this.twoFactorService = new TwoFactorAuthService(db);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Obter status do 2FA do usuário atual
    this.app.get('/status', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`📱 Getting 2FA status for user: ${user.id}`);

        const status = await this.twoFactorService.getTwoFactorStatus(user.id);

        return c.json({
          success: true,
          data: {
            ...status,
            timeRemaining: this.twoFactorService.getTimeRemaining(),
          },
        });

      } catch (error) {
        console.error('Error getting 2FA status:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar status do 2FA',
        }, 500);
      }
    });

    // Configurar 2FA (gerar QR Code e códigos de backup)
    this.app.post('/setup', zValidator('json', setupTwoFactorSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { appName } = c.req.valid('json');

        console.log(`🔐 Setting up 2FA for user: ${user.email}`);

        const result = await this.twoFactorService.setupTwoFactor(
          user.id,
          appName,
          user.email
        );

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: {
              qrCodeUrl: result.qrCodeUrl,
              backupCodes: result.backupCodes,
              manualEntryKey: result.manualEntryKey,
              timeRemaining: this.twoFactorService.getTimeRemaining(),
            },
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error setting up 2FA:', error);
        return c.json({
          success: false,
          error: 'Erro ao configurar 2FA',
        }, 500);
      }
    });

    // Ativar 2FA após verificação inicial
    this.app.post('/enable', zValidator('json', enableTwoFactorSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { verificationCode } = c.req.valid('json');

        // Validar formato do código
        if (!this.twoFactorService.isValidCodeFormat(verificationCode)) {
          return c.json({
            success: false,
            error: 'Formato de código inválido',
          }, 400);
        }

        console.log(`🔐 Enabling 2FA for user: ${user.email}`);

        const result = await this.twoFactorService.enableTwoFactor(user.id, verificationCode);

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
        console.error('Error enabling 2FA:', error);
        return c.json({
          success: false,
          error: 'Erro ao ativar 2FA',
        }, 500);
      }
    });

    // Verificar código 2FA
    this.app.post('/verify', zValidator('json', verifyTwoFactorSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { code } = c.req.valid('json');

        // Validar formato do código
        if (!this.twoFactorService.isValidCodeFormat(code)) {
          return c.json({
            success: false,
            error: 'Formato de código inválido',
          }, 400);
        }

        console.log(`🔍 Verifying 2FA code for user: ${user.email}`);

        const result = await this.twoFactorService.verifyTwoFactor(user.id, code);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: {
              isBackupCode: result.isBackupCode,
              timeRemaining: this.twoFactorService.getTimeRemaining(),
            },
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error verifying 2FA:', error);
        return c.json({
          success: false,
          error: 'Erro ao verificar código 2FA',
        }, 500);
      }
    });

    // Desativar 2FA
    this.app.post('/disable', zValidator('json', disableTwoFactorSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { verificationCode } = c.req.valid('json');

        // Validar formato do código
        if (!this.twoFactorService.isValidCodeFormat(verificationCode)) {
          return c.json({
            success: false,
            error: 'Formato de código inválido',
          }, 400);
        }

        console.log(`🔐 Disabling 2FA for user: ${user.email}`);

        const result = await this.twoFactorService.disableTwoFactor(user.id, verificationCode);

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
        console.error('Error disabling 2FA:', error);
        return c.json({
          success: false,
          error: 'Erro ao desativar 2FA',
        }, 500);
      }
    });

    // Gerar novos códigos de backup
    this.app.post('/regenerate-backup-codes', zValidator('json', regenerateBackupCodesSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { verificationCode } = c.req.valid('json');

        // Validar formato do código
        if (!this.twoFactorService.isValidCodeFormat(verificationCode)) {
          return c.json({
            success: false,
            error: 'Formato de código inválido',
          }, 400);
        }

        console.log(`🔄 Regenerating backup codes for user: ${user.email}`);

        const result = await this.twoFactorService.regenerateBackupCodes(user.id, verificationCode);

        if (result.success) {
          return c.json({
            success: true,
            message: result.message,
            data: {
              backupCodes: result.codes,
            },
          });
        } else {
          return c.json({
            success: false,
            error: result.message,
          }, 400);
        }

      } catch (error) {
        console.error('Error regenerating backup codes:', error);
        return c.json({
          success: false,
          error: 'Erro ao gerar novos códigos de backup',
        }, 500);
      }
    });

    // Reset 2FA (apenas para admins)
    this.app.post('/reset', zValidator('json', resetTwoFactorSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem resetar 2FA de outros usuários',
          }, 403);
        }

        const { userId } = c.req.valid('json');

        // Admin não pode resetar seu próprio 2FA por questões de segurança
        if (user.id === userId) {
          return c.json({
            success: false,
            error: 'Administradores não podem resetar seu próprio 2FA por questões de segurança',
          }, 400);
        }

        console.log(`⚠️ Admin ${user.email} resetting 2FA for user: ${userId}`);

        const result = await this.twoFactorService.resetTwoFactor(userId, user.id);

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
        console.error('Error resetting 2FA:', error);
        return c.json({
          success: false,
          error: 'Erro ao resetar 2FA',
        }, 500);
      }
    });

    // Informações sobre tempo do TOTP
    this.app.get('/time-info', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        return c.json({
          success: true,
          data: {
            timeRemaining: this.twoFactorService.getTimeRemaining(),
            stepDuration: 30, // TOTP step duration in seconds
            currentTime: Math.floor(Date.now() / 1000),
          },
        });

      } catch (error) {
        console.error('Error getting time info:', error);
        return c.json({
          success: false,
          error: 'Erro ao obter informações de tempo',
        }, 500);
      }
    });

    // Validar formato de código (utilitário para frontend)
    this.app.post('/validate-code-format', async (c) => {
      try {
        const body = await c.req.json();
        const { code } = body;

        if (!code || typeof code !== 'string') {
          return c.json({
            success: false,
            error: 'Código é obrigatório',
          }, 400);
        }

        const isValid = this.twoFactorService.isValidCodeFormat(code);
        const isTOTP = /^\d{6}$/.test(code);
        const isBackupCode = /^[A-F0-9]{4}-[A-F0-9]{4}$/i.test(code);

        return c.json({
          success: true,
          data: {
            isValid,
            type: isTOTP ? 'totp' : isBackupCode ? 'backup' : 'invalid',
          },
        });

      } catch (error) {
        console.error('Error validating code format:', error);
        return c.json({
          success: false,
          error: 'Erro ao validar formato do código',
        }, 500);
      }
    });

    // Health check
    this.app.get('/health', async (c) => {
      try {
        return c.json({
          success: true,
          service: 'two-factor-auth',
          status: 'healthy',
          data: {
            totpTimeStep: 30,
            totpWindow: 2,
            backupCodesCount: 8,
            supportedFormats: ['totp', 'backup'],
          },
        });

      } catch (error) {
        console.error('2FA health check failed:', error);
        return c.json({
          success: false,
          service: 'two-factor-auth',
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