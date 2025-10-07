import { DatabaseType } from '../repositories/BaseRepository';
import { Article } from '../config/db/schema';
import { NotificationSettingsRepository } from '../repositories/NotificationSettingsRepository';

export interface SlackMessage {
  title: string;
  description: string;
  url?: string;
  imageUrl?: string;
  category: 'success' | 'warning' | 'error' | 'info' | 'technology';
  source: string;
  author?: string;
  status?: string;
  timestamp?: string;
}

export interface NotificationSettings {
  id: string;
  webhookUrl: string;
  enabled: boolean;
  notifications: {
    newArticle: boolean;
    statusChange: boolean;
    changeRequest: boolean;
    approval: boolean;
    publication: boolean;
    rejection: boolean;
    beehiivSync: boolean;
    archive: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationService {
  private db: DatabaseType;
  private settingsRepository: NotificationSettingsRepository;

  constructor(db: DatabaseType) {
    this.db = db;
    this.settingsRepository = new NotificationSettingsRepository(db);
  }

  /**
   * Enviar notificação para Slack
   */
  async sendSlackNotification(webhookUrl: string, message: SlackMessage): Promise<boolean> {
    try {
      const payload = {
        text: message.title,
        attachments: [
          {
            color: this.getColorForCategory(message.category),
            fields: [
              {
                title: "Descrição",
                value: message.description,
                short: false
              },
              {
                title: "Fonte",
                value: message.source,
                short: true
              },
              {
                title: "Categoria",
                value: message.category,
                short: true
              }
            ],
            footer: "Portal CMS",
            ts: Math.floor(Date.now() / 1000)
          }
        ]
      };

      // Adicionar campos opcionais
      if (message.author) {
        payload.attachments[0].fields.push({
          title: "Autor",
          value: message.author,
          short: true
        });
      }

      if (message.status) {
        payload.attachments[0].fields.push({
          title: "Status",
          value: message.status,
          short: true
        });
      }

      if (message.url) {
        (payload.attachments[0] as any).actions = [
          {
            type: "button",
            text: "Ver Artigo",
            url: message.url
          }
        ];
      }

      if (message.imageUrl) {
        (payload.attachments[0] as any).image_url = message.imageUrl;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Notificar novo artigo criado
   */
  async notifyNewArticle(article: Article, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.newArticle) return;

      const message: SlackMessage = {
        title: "📝 Novo Artigo Criado",
        description: `"${article.title}" foi criado e está aguardando revisão.`,
        category: 'info',
        source: article.source === 'beehiiv' ? 'BeehIV Sync' : 'Portal CMS',
        author: authorName,
        status: article.status,
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar mudança de status
   */
  async notifyStatusChange(article: Article, oldStatus: string, newStatus: string, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.statusChange) return;

      const statusEmojis = {
        'draft': '📝',
        'review': '👀',
        'solicitado_mudancas': '🔄',
        'revisado': '✅',
        'approved': '👍',
        'published': '🚀',
        'rejected': '❌',
        'archived': '📦'
      };

      const message: SlackMessage = {
        title: `${statusEmojis[newStatus] || '📄'} Status do Artigo Alterado`,
        description: `"${article.title}" mudou de ${oldStatus} para ${newStatus}.`,
        category: this.getCategoryForStatus(newStatus),
        source: 'Portal CMS',
        author: authorName,
        status: newStatus,
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar solicitação de mudanças
   */
  async notifyChangeRequest(article: Article, reason: string, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.changeRequest) return;

      const message: SlackMessage = {
        title: "🔄 Mudanças Solicitadas",
        description: `"${article.title}" - ${reason}`,
        category: 'warning',
        source: 'Portal CMS',
        author: authorName,
        status: 'solicitado_mudancas',
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar aprovação
   */
  async notifyApproval(article: Article, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.approval) return;

      const message: SlackMessage = {
        title: "👍 Artigo Aprovado",
        description: `"${article.title}" foi aprovado e está pronto para publicação.`,
        category: 'success',
        source: 'Portal CMS',
        author: authorName,
        status: 'approved',
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar publicação
   */
  async notifyPublication(article: Article, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.publication) return;

      const message: SlackMessage = {
        title: "🚀 Artigo Publicado",
        description: `"${article.title}" foi publicado e está disponível no portal.`,
        category: 'success',
        source: 'Portal CMS',
        author: authorName,
        status: 'published',
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar rejeição
   */
  async notifyRejection(article: Article, reason: string, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.rejection) return;

      const message: SlackMessage = {
        title: "❌ Artigo Rejeitado",
        description: `"${article.title}" - ${reason}`,
        category: 'error',
        source: 'Portal CMS',
        author: authorName,
        status: 'rejected',
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar sincronização BeehIV
   */
  async notifyBeehiivSync(articleCount: number, newsletterName: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.beehiivSync) return;

      const message: SlackMessage = {
        title: "📰 Sincronização BeehIV",
        description: `${articleCount} novo(s) artigo(s) sincronizado(s) de "${newsletterName}".`,
        category: 'technology',
        source: 'BeehIV Sync',
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Notificar arquivamento
   */
  async notifyArchive(article: Article, authorName?: string): Promise<void> {
    try {
      const settings = await this.getNotificationSettings();
      if (!settings?.enabled || !settings.notifications.archive) return;

      const message: SlackMessage = {
        title: "📦 Artigo Arquivado",
        description: `"${article.title}" foi arquivado.`,
        category: 'info',
        source: 'Portal CMS',
        author: authorName,
        status: 'archived',
        timestamp: new Date().toISOString()
      };

      await this.sendSlackNotification(settings.webhookUrl, message);
    } catch (error) {
      // Silently fail - notifications should not break the main flow
    }
  }

  /**
   * Obter configurações de notificação
   */
  async getNotificationSettings(): Promise<NotificationSettings | null> {
    try {
      const settings = await this.settingsRepository.getSettings();
      if (!settings) return null;
      
      // Ensure enabled is boolean, not null
      return {
        ...settings,
        enabled: settings.enabled ?? false
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Salvar configurações de notificação
   */
  async saveNotificationSettings(settings: Omit<NotificationSettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<boolean> {
    try {
      await this.settingsRepository.saveSettings(settings);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obter cor para categoria
   */
  private getColorForCategory(category: string): string {
    const colors = {
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6',
      technology: '#8b5cf6'
    };
    return colors[category] || colors.info;
  }

  /**
   * Obter categoria para status
   */
  private getCategoryForStatus(status: string): 'success' | 'warning' | 'error' | 'info' {
    switch (status) {
      case 'published':
      case 'approved':
        return 'success';
      case 'rejected':
        return 'error';
      case 'solicitado_mudancas':
        return 'warning';
      default:
        return 'info';
    }
  }
}