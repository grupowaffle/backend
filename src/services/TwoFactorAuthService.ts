/**
 * Serviço de autenticação multi-fator (2FA)
 * Implementa TOTP (Time-based One-Time Password) e códigos de backup
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
// Users table removed - using D1 for user management
import crypto from 'crypto';

export interface TwoFactorSetupResult {
  success: boolean;
  message: string;
  secret?: string;
  qrCodeUrl?: string;
  backupCodes?: string[];
  manualEntryKey?: string;
}

export interface TwoFactorVerificationResult {
  success: boolean;
  message: string;
  isBackupCode?: boolean;
}

export interface BackupCodesResult {
  success: boolean;
  message: string;
  codes?: string[];
}

export class TwoFactorAuthService {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Configurar 2FA para um usuário
   */
  async setupTwoFactor(
    userId: string,
    appName: string = 'TheNews CMS',
    userEmail?: string
  ): Promise<TwoFactorSetupResult> {
    try {
      console.log(`🔐 Setting up 2FA for user: ${userId}`);

      // Verificar se o usuário existe
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (user.twoFactorEnabled) {
        return { success: false, message: '2FA já está ativado para este usuário' };
      }

      // Gerar segredo TOTP
      const secret = speakeasy.generateSecret({
        length: 32,
        name: userEmail || user.email,
        issuer: appName,
      });

      if (!secret.base32) {
        return { success: false, message: 'Erro ao gerar segredo 2FA' };
      }

      // Gerar códigos de backup
      const backupCodes = this.generateBackupCodes(8);

      // Gerar QR Code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url || '');

      // Salvar configuração temporária (não ativar ainda)
      await this.db
        .update(users)
        .set({
          twoFactorSecret: secret.base32,
          backupCodes: JSON.stringify(backupCodes),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✅ 2FA setup prepared for user: ${userId}`);

      return {
        success: true,
        message: '2FA configurado. Use o aplicativo autenticador para escanear o QR Code.',
        secret: secret.base32,
        qrCodeUrl,
        backupCodes,
        manualEntryKey: secret.base32,
      };

    } catch (error) {
      console.error('Error setting up 2FA:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao configurar 2FA',
      };
    }
  }

  /**
   * Ativar 2FA após verificação inicial
   */
  async enableTwoFactor(userId: string, verificationCode: string): Promise<TwoFactorVerificationResult> {
    try {
      console.log(`🔐 Enabling 2FA for user: ${userId}`);

      // Buscar usuário e segredo
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (user.twoFactorEnabled) {
        return { success: false, message: '2FA já está ativado' };
      }

      if (!user.twoFactorSecret) {
        return { success: false, message: '2FA não foi configurado. Execute a configuração primeiro.' };
      }

      // Verificar código
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: verificationCode,
        window: 2, // Permite uma margem de 60 segundos para frente e para trás
      });

      if (!verified) {
        return { success: false, message: 'Código de verificação inválido' };
      }

      // Ativar 2FA
      await this.db
        .update(users)
        .set({
          twoFactorEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✅ 2FA enabled for user: ${userId}`);

      return {
        success: true,
        message: '2FA ativado com sucesso',
      };

    } catch (error) {
      console.error('Error enabling 2FA:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao ativar 2FA',
      };
    }
  }

  /**
   * Verificar código 2FA
   */
  async verifyTwoFactor(userId: string, code: string): Promise<TwoFactorVerificationResult> {
    try {
      console.log(`🔍 Verifying 2FA code for user: ${userId}`);

      // Buscar usuário
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (!user.twoFactorEnabled || !user.twoFactorSecret) {
        return { success: false, message: '2FA não está ativado para este usuário' };
      }

      // Primeiro, tentar verificar como código TOTP
      const totpVerified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: code,
        window: 2,
      });

      if (totpVerified) {
        console.log(`✅ TOTP verified for user: ${userId}`);
        return {
          success: true,
          message: 'Código 2FA verificado com sucesso',
          isBackupCode: false,
        };
      }

      // Se TOTP falhar, verificar códigos de backup
      if (user.backupCodes) {
        const backupCodes = JSON.parse(user.backupCodes) as string[];
        
        if (backupCodes.includes(code)) {
          // Remover código de backup usado
          const updatedCodes = backupCodes.filter(backupCode => backupCode !== code);
          
          await this.db
            .update(users)
            .set({
              backupCodes: JSON.stringify(updatedCodes),
              updatedAt: new Date(),
            })
            .where(eq(users.id, userId));

          console.log(`✅ Backup code verified and consumed for user: ${userId}`);

          return {
            success: true,
            message: 'Código de backup verificado com sucesso',
            isBackupCode: true,
          };
        }
      }

      console.log(`❌ 2FA verification failed for user: ${userId}`);
      return {
        success: false,
        message: 'Código de verificação inválido',
      };

    } catch (error) {
      console.error('Error verifying 2FA:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao verificar código 2FA',
      };
    }
  }

  /**
   * Desativar 2FA
   */
  async disableTwoFactor(
    userId: string,
    verificationCode: string
  ): Promise<TwoFactorVerificationResult> {
    try {
      console.log(`🔐 Disabling 2FA for user: ${userId}`);

      // Primeiro verificar o código
      const verification = await this.verifyTwoFactor(userId, verificationCode);
      if (!verification.success) {
        return verification;
      }

      // Desativar 2FA
      await this.db
        .update(users)
        .set({
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✅ 2FA disabled for user: ${userId}`);

      return {
        success: true,
        message: '2FA desativado com sucesso',
      };

    } catch (error) {
      console.error('Error disabling 2FA:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao desativar 2FA',
      };
    }
  }

  /**
   * Gerar novos códigos de backup
   */
  async regenerateBackupCodes(
    userId: string,
    verificationCode: string
  ): Promise<BackupCodesResult> {
    try {
      console.log(`🔄 Regenerating backup codes for user: ${userId}`);

      // Verificar código 2FA
      const verification = await this.verifyTwoFactor(userId, verificationCode);
      if (!verification.success) {
        return {
          success: false,
          message: verification.message,
        };
      }

      // Gerar novos códigos
      const newBackupCodes = this.generateBackupCodes(8);

      // Salvar novos códigos
      await this.db
        .update(users)
        .set({
          backupCodes: JSON.stringify(newBackupCodes),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✅ Backup codes regenerated for user: ${userId}`);

      return {
        success: true,
        message: 'Novos códigos de backup gerados com sucesso',
        codes: newBackupCodes,
      };

    } catch (error) {
      console.error('Error regenerating backup codes:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao gerar novos códigos de backup',
      };
    }
  }

  /**
   * Verificar status do 2FA para um usuário
   */
  async getTwoFactorStatus(userId: string): Promise<{
    enabled: boolean;
    backupCodesCount: number;
    hasSecret: boolean;
  }> {
    try {
      const [user] = await this.db
        .select({
          twoFactorEnabled: users.twoFactorEnabled,
          twoFactorSecret: users.twoFactorSecret,
          backupCodes: users.backupCodes,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { enabled: false, backupCodesCount: 0, hasSecret: false };
      }

      const backupCodes = user.backupCodes ? JSON.parse(user.backupCodes) : [];

      return {
        enabled: user.twoFactorEnabled || false,
        backupCodesCount: backupCodes.length,
        hasSecret: !!user.twoFactorSecret,
      };

    } catch (error) {
      console.error('Error getting 2FA status:', error);
      return { enabled: false, backupCodesCount: 0, hasSecret: false };
    }
  }

  /**
   * Reset 2FA (para admins - em caso de perda de acesso)
   */
  async resetTwoFactor(
    userId: string,
    resetBy: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🔄 Admin reset 2FA for user: ${userId} by ${resetBy}`);

      await this.db
        .update(users)
        .set({
          twoFactorEnabled: false,
          twoFactorSecret: null,
          backupCodes: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // TODO: Log this action in audit logs
      console.log(`✅ 2FA reset completed for user: ${userId}`);

      return {
        success: true,
        message: '2FA foi resetado com sucesso',
      };

    } catch (error) {
      console.error('Error resetting 2FA:', error);
      return {
        success: false,
        message: 'Erro ao resetar 2FA',
      };
    }
  }

  /**
   * Gerar códigos de backup
   */
  private generateBackupCodes(count: number = 8): string[] {
    const codes: string[] = [];
    
    for (let i = 0; i < count; i++) {
      // Gerar código de 8 dígitos
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      // Formatação: XXXX-XXXX
      const formattedCode = `${code.substring(0, 4)}-${code.substring(4, 8)}`;
      codes.push(formattedCode);
    }

    return codes;
  }

  /**
   * Validar formato do código
   */
  isValidCodeFormat(code: string): boolean {
    // TOTP: 6 dígitos numéricos
    const totpPattern = /^\d{6}$/;
    
    // Backup code: XXXX-XXXX format
    const backupPattern = /^[A-F0-9]{4}-[A-F0-9]{4}$/i;

    return totpPattern.test(code) || backupPattern.test(code.toUpperCase());
  }

  /**
   * Obter tempo restante para o próximo código TOTP
   */
  getTimeRemaining(): number {
    const now = Math.floor(Date.now() / 1000);
    const timeStep = 30; // TOTP usa 30 segundos por padrão
    const timeRemaining = timeStep - (now % timeStep);
    return timeRemaining;
  }

  /**
   * Gerar URL do QR Code manualmente (se necessário)
   */
  generateQRCodeUrl(secret: string, userEmail: string, issuer: string = 'TheNews CMS'): string {
    const otpUrl = `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(userEmail)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
    return otpUrl;
  }
}