/**
 * Serviço de notificações para o sistema editorial
 * Gerencia notificações de workflow, novos conteúdos e alertas do sistema
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import { eq, and, desc, count, sql, inArray } from 'drizzle-orm';
import { notifications } from '../config/db/schema';

export type NotificationType = 
  | 'article_status_changed'    // Mudança de status de artigo
  | 'article_assigned'          // Artigo atribuído
  | 'article_published'         // Artigo publicado
  | 'article_rejected'          // Artigo rejeitado
  | 'new_beehiiv_content'      // Novo conteúdo do BeehIv
  | 'scheduled_publication'     // Publicação agendada
  | 'system_alert'             // Alerta do sistema
  | 'workflow_reminder';       // Lembrete de workflow

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface NotificationData {
  id?: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  data?: Record<string, any>; // Dados específicos da notificação
  actionUrl?: string;
  actionText?: string;
  isRead: boolean;
  readAt?: Date;
  createdAt?: Date;
  expiresAt?: Date;
}

export interface NotificationPreferences {
  userId: string;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  types: NotificationType[];
}

export class NotificationService {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Criar nova notificação
   */
  async createNotification(notificationData: Omit<NotificationData, 'id' | 'createdAt' | 'isRead'>): Promise<NotificationData> {
    try {
      const notification: NotificationData = {
        id: generateId(),
        ...notificationData,
        isRead: false,
        createdAt: new Date(),
      };

      const [created] = await this.db
        .insert(notifications)
        .values(notification)
        .returning();

      console.log(`🔔 Notification created: ${notification.title} for user ${notification.userId}`);

      return created;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Criar notificações em lote
   */
  async createBulkNotifications(notificationsData: Omit<NotificationData, 'id' | 'createdAt' | 'isRead'>[]): Promise<NotificationData[]> {
    if (notificationsData.length === 0) return [];

    try {
      const notificationRecords: NotificationData[] = notificationsData.map(data => ({
        id: generateId(),
        ...data,
        isRead: false,
        createdAt: new Date(),
      }));

      const created = await this.db
        .insert(notifications)
        .values(notificationRecords)
        .returning();

      console.log(`🔔 ${created.length} notifications created in bulk`);

      return created;
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      throw error;
    }
  }

  /**
   * Obter notificações do usuário
   */
  async getUserNotifications(
    userId: string,
    options: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      type?: NotificationType;
    } = {}
  ): Promise<{ notifications: NotificationData[]; total: number; unread: number }> {
    const { page = 1, limit = 20, unreadOnly = false, type } = options;

    try {
      let query = this.db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId));

      // Filtros
      if (unreadOnly) {
        query = query.where(eq(notifications.isRead, false));
      }

      if (type) {
        query = query.where(eq(notifications.type, type));
      }

      // Ordenação e paginação
      const offset = (page - 1) * limit;
      const results = await query
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);

      // Contar total
      let countQuery = this.db
        .select({ count: count() })
        .from(notifications)
        .where(eq(notifications.userId, userId));

      if (unreadOnly) {
        countQuery = countQuery.where(eq(notifications.isRead, false));
      }

      if (type) {
        countQuery = countQuery.where(eq(notifications.type, type));
      }

      const [{ count: total }] = await countQuery;

      // Contar não lidas
      const [{ count: unread }] = await this.db
        .select({ count: count() })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.isRead, false)
          )
        );

      return {
        notifications: results,
        total: Number(total),
        unread: Number(unread),
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      return { notifications: [], total: 0, unread: 0 };
    }
  }

  /**
   * Marcar notificação como lida
   */
  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userId, userId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Marcar todas as notificações como lidas
   */
  async markAllAsRead(userId: string): Promise<number> {
    try {
      const result = await this.db
        .update(notifications)
        .set({
          isRead: true,
          readAt: new Date(),
        })
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.isRead, false)
          )
        );

      console.log(`✅ Marked all notifications as read for user ${userId}`);
      
      return 0; // TODO: retornar número de notificações marcadas
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return 0;
    }
  }

  /**
   * Deletar notificação
   */
  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db
        .delete(notifications)
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userId, userId)
          )
        );

      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }

  /**
   * Limpar notificações antigas
   */
  async cleanupOldNotifications(olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await this.db
        .delete(notifications)
        .where(sql`${notifications.createdAt} < ${cutoffDate}`);

      console.log(`🧹 Cleaned up old notifications older than ${olderThanDays} days`);
      
      return 0; // TODO: retornar número de notificações removidas
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      return 0;
    }
  }

  // Métodos de conveniência para tipos específicos de notificação

  /**
   * Notificar mudança de status de artigo
   */
  async notifyArticleStatusChanged(
    articleId: string,
    articleTitle: string,
    fromStatus: string,
    toStatus: string,
    changedBy: string,
    affectedUserId: string,
    feedback?: string
  ): Promise<void> {
    const priority: NotificationPriority = toStatus === 'rejected' ? 'high' : 'medium';
    
    let title = '';
    let message = '';
    let actionUrl = `/articles/${articleId}`;

    switch (toStatus) {
      case 'published':
        title = 'Artigo publicado';
        message = `Seu artigo "${articleTitle}" foi publicado`;
        break;
      case 'approved':
        title = 'Artigo aprovado';
        message = `Seu artigo "${articleTitle}" foi aprovado e está pronto para publicação`;
        break;
      case 'rejected':
        title = 'Artigo rejeitado';
        message = `Seu artigo "${articleTitle}" foi rejeitado${feedback ? ': ' + feedback : ''}`;
        break;
      case 'review':
        title = 'Artigo em revisão';
        message = `Seu artigo "${articleTitle}" está em revisão`;
        break;
      default:
        title = 'Status do artigo alterado';
        message = `Seu artigo "${articleTitle}" mudou de status: ${fromStatus} → ${toStatus}`;
    }

    await this.createNotification({
      userId: affectedUserId,
      type: 'article_status_changed',
      title,
      message,
      priority,
      data: {
        articleId,
        articleTitle,
        fromStatus,
        toStatus,
        changedBy,
        feedback,
      },
      actionUrl,
      actionText: 'Ver artigo',
    });
  }

  /**
   * Notificar atribuição de artigo
   */
  async notifyArticleAssigned(
    articleId: string,
    articleTitle: string,
    assignedToUserId: string,
    assignedByUserName: string
  ): Promise<void> {
    await this.createNotification({
      userId: assignedToUserId,
      type: 'article_assigned',
      title: 'Artigo atribuído',
      message: `O artigo "${articleTitle}" foi atribuído a você por ${assignedByUserName}`,
      priority: 'medium',
      data: {
        articleId,
        articleTitle,
        assignedByUserName,
      },
      actionUrl: `/articles/${articleId}`,
      actionText: 'Revisar artigo',
    });
  }

  /**
   * Notificar novo conteúdo BeehIiv
   */
  async notifyNewBeehiivContent(
    articleId: string,
    articleTitle: string,
    publicationName: string,
    editorsAndReviewers: string[]
  ): Promise<void> {
    if (editorsAndReviewers.length === 0) return;

    const notificationsData = editorsAndReviewers.map(userId => ({
      userId,
      type: 'new_beehiiv_content' as NotificationType,
      title: 'Novo conteúdo BeehIiv',
      message: `Nova newsletter "${articleTitle}" de ${publicationName} importada e aguarda revisão`,
      priority: 'low' as NotificationPriority,
      data: {
        articleId,
        articleTitle,
        publicationName,
      },
      actionUrl: `/articles/${articleId}`,
      actionText: 'Revisar conteúdo',
    }));

    await this.createBulkNotifications(notificationsData);
  }

  /**
   * Notificar administradores sobre alertas do sistema
   */
  async notifySystemAlert(
    title: string,
    message: string,
    priority: NotificationPriority = 'medium',
    data?: Record<string, any>
  ): Promise<void> {
    try {
      // Buscar todos os administradores
      const admins = await this.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'));

      if (admins.length === 0) return;

      const notificationsData = admins.map(admin => ({
        userId: admin.id.toString(),
        type: 'system_alert' as NotificationType,
        title,
        message,
        priority,
        data,
      }));

      await this.createBulkNotifications(notificationsData);
    } catch (error) {
      console.error('Error notifying system alert:', error);
    }
  }

  /**
   * Notificar lembretes de workflow
   */
  async notifyWorkflowReminders(): Promise<void> {
    try {
      // TODO: Implementar lógica para encontrar artigos em revisão há muito tempo
      // e notificar os responsáveis
      console.log('🔔 Processing workflow reminders...');
      
      // Por enquanto, apenas log
      // Em uma implementação real, buscaria artigos em 'review' há mais de X horas
      // e notificaria os revisores
    } catch (error) {
      console.error('Error processing workflow reminders:', error);
    }
  }

  /**
   * Obter estatísticas de notificações
   */
  async getNotificationStats(userId?: string): Promise<{
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
    byPriority: Record<NotificationPriority, number>;
  }> {
    try {
      let whereClause = sql`1 = 1`;
      if (userId) {
        whereClause = eq(notifications.userId, userId);
      }

      // Total e não lidas
      const [totals] = await this.db
        .select({
          total: count(),
          unread: count(sql`CASE WHEN ${notifications.isRead} = false THEN 1 END`),
        })
        .from(notifications)
        .where(whereClause);

      // Por tipo
      const byTypeQuery = await this.db
        .select({
          type: notifications.type,
          count: count(),
        })
        .from(notifications)
        .where(whereClause)
        .groupBy(notifications.type);

      // Por prioridade
      const byPriorityQuery = await this.db
        .select({
          priority: notifications.priority,
          count: count(),
        })
        .from(notifications)
        .where(whereClause)
        .groupBy(notifications.priority);

      const byType: Record<string, number> = {};
      byTypeQuery.forEach(({ type, count }) => {
        byType[type] = Number(count);
      });

      const byPriority: Record<string, number> = {};
      byPriorityQuery.forEach(({ priority, count }) => {
        byPriority[priority] = Number(count);
      });

      return {
        total: Number(totals.total),
        unread: Number(totals.unread),
        byType: byType as Record<NotificationType, number>,
        byPriority: byPriority as Record<NotificationPriority, number>,
      };
    } catch (error) {
      console.error('Error getting notification stats:', error);
      return {
        total: 0,
        unread: 0,
        byType: {} as Record<NotificationType, number>,
        byPriority: {} as Record<NotificationPriority, number>,
      };
    }
  }
}