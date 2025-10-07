import { BaseRepository } from './BaseRepository';
import { notificationSettings, NotificationSettings, NewNotificationSettings } from '../config/db/schema';
import { eq } from 'drizzle-orm';
import { generateId } from '../lib/cuid';

export class NotificationSettingsRepository extends BaseRepository {
  /**
   * Obter configurações de notificação (sempre retorna o primeiro registro)
   */
  async getSettings(): Promise<NotificationSettings | null> {
    try {
      const result = await (this.db as any)
        .select()
        .from(notificationSettings)
        .limit(1);

      return result[0] || null;
    } catch (error) {
      this.handleError(error, 'get notification settings');
      throw error;
    }
  }

  /**
   * Salvar ou atualizar configurações de notificação
   */
  async saveSettings(data: Omit<NewNotificationSettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotificationSettings> {
    try {
      // Verificar se já existe configuração
      const existing = await this.getSettings();

      if (existing) {
        // Atualizar configuração existente
        const [updated] = await (this.db as any)
          .update(notificationSettings)
          .set({
            ...data,
            updatedAt: new Date(),
          })
          .where(eq(notificationSettings.id, existing.id))
          .returning();

        return updated;
      } else {
        // Criar nova configuração
        const [created] = await (this.db as any)
          .insert(notificationSettings)
          .values({
            id: generateId(),
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        return created;
      }
    } catch (error) {
      this.handleError(error, 'save notification settings');
      throw error;
    }
  }

  /**
   * Deletar configurações de notificação
   */
  async deleteSettings(): Promise<boolean> {
    try {
      await (this.db as any)
        .delete(notificationSettings);

      return true;
    } catch (error) {
      this.handleError(error, 'delete notification settings');
      throw error;
    }
  }
}
