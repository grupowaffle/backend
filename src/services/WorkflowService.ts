/**
 * Serviço de gestão do workflow editorial
 * Gerencia os estados e transições dos artigos no processo editorial
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { ArticleRepository } from '../repositories/ArticleRepository';
import { NotificationService } from './NotificationService';
import { generateId } from '../lib/cuid';
import { eq, and, desc, count, sql } from 'drizzle-orm';
import { articles, workflowHistory } from '../config/db/schema';

// Estados do workflow
export type WorkflowStatus = 
  | 'beehiiv_pending'  // Importado do BeehIv, aguardando revisão
  | 'draft'            // Rascunho (artigos manuais ou editados)
  | 'review'           // Em revisão
  | 'approved'         // Aprovado, pronto para publicação
  | 'published'        // Publicado
  | 'archived'         // Arquivado
  | 'rejected';        // Rejeitado

// Transições permitidas
const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  beehiiv_pending: ['draft', 'review', 'archived'],
  draft: ['review', 'archived'],
  review: ['approved', 'draft', 'rejected'],
  approved: ['published', 'draft'],
  published: ['archived'],
  archived: ['draft'],
  rejected: ['draft', 'archived'],
};

// Permissões por role
const ROLE_PERMISSIONS: Record<string, WorkflowStatus[]> = {
  admin: ['beehiiv_pending', 'draft', 'review', 'approved', 'published', 'archived', 'rejected'],
  'editor-chefe': ['beehiiv_pending', 'draft', 'review', 'approved', 'published', 'rejected'],
  editor: ['beehiiv_pending', 'draft', 'review'],
  revisor: ['review', 'approved', 'rejected'],
  developer: ['beehiiv_pending', 'draft', 'review', 'approved', 'published', 'archived', 'rejected'],
};

export interface WorkflowTransition {
  id: string;
  articleId: string;
  fromStatus: WorkflowStatus;
  toStatus: WorkflowStatus;
  userId: string;
  userName: string;
  userRole: string;
  reason?: string;
  feedback?: string;
  createdAt: Date;
}

export interface WorkflowStats {
  statusCounts: Record<WorkflowStatus, number>;
  pendingReview: number;
  approvedWaiting: number;
  publishedToday: number;
  rejectionRate: number;
  averageApprovalTime: number; // hours
}

export class WorkflowService {
  private db: DatabaseType;
  private articleRepository: ArticleRepository;
  private notificationService: NotificationService;

  constructor(db: DatabaseType) {
    this.db = db;
    this.articleRepository = new ArticleRepository(db);
    this.notificationService = new NotificationService(db);
  }

  /**
   * Verificar se transição é válida
   */
  canTransition(
    fromStatus: WorkflowStatus, 
    toStatus: WorkflowStatus, 
    userRole: string
  ): boolean {
    // Verificar se transição é permitida
    const allowedTransitions = WORKFLOW_TRANSITIONS[fromStatus] || [];
    if (!allowedTransitions.includes(toStatus)) {
      return false;
    }

    // Verificar permissões do usuário
    const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
    return rolePermissions.includes(toStatus);
  }

  /**
   * Executar transição de status
   */
  async transitionStatus(
    articleId: string,
    toStatus: WorkflowStatus,
    userId: string,
    userName: string,
    userRole: string,
    options: {
      reason?: string;
      feedback?: string;
      publishedAt?: Date;
      scheduledFor?: Date;
    } = {}
  ): Promise<{ success: boolean; message: string; article?: any }> {
    try {
      console.log(`🔄 Transitioning article ${articleId} to ${toStatus} by ${userName} (${userRole})`);

      // Buscar artigo atual
      const article = await this.articleRepository.findById(articleId);
      if (!article) {
        return { success: false, message: 'Artigo não encontrado' };
      }

      const currentStatus = article.status as WorkflowStatus;

      // Verificar se transição é válida
      if (!this.canTransition(currentStatus, toStatus, userRole)) {
        return { 
          success: false, 
          message: `Transição de ${currentStatus} para ${toStatus} não permitida para ${userRole}` 
        };
      }

      // Preparar dados de atualização
      const updateData: any = {
        status: toStatus,
        updatedAt: new Date(),
      };

      // Configurações específicas por status
      switch (toStatus) {
        case 'published':
          updateData.publishedAt = options.publishedAt || new Date();
          break;
        case 'approved':
          updateData.approvedAt = new Date();
          updateData.approvedBy = userId;
          break;
        case 'rejected':
          updateData.rejectedAt = new Date();
          updateData.rejectedBy = userId;
          break;
        case 'review':
          updateData.reviewRequestedAt = new Date();
          updateData.reviewRequestedBy = userId;
          break;
      }

      if (options.scheduledFor) {
        updateData.scheduledFor = options.scheduledFor;
      }

      // Atualizar artigo
      const updatedArticle = await this.articleRepository.update(articleId, updateData);
      if (!updatedArticle) {
        return { success: false, message: 'Falha ao atualizar artigo' };
      }

      // Registrar no histórico
      await this.recordWorkflowHistory({
        articleId,
        fromStatus: currentStatus,
        toStatus,
        userId,
        userName,
        userRole,
        reason: options.reason,
        feedback: options.feedback,
      });

      // Enviar notificações se necessário
      if (article.authorId && article.authorId !== userId) {
        await this.notificationService.notifyArticleStatusChanged(
          articleId,
          article.title,
          currentStatus,
          toStatus,
          userName,
          article.authorId,
          options.feedback
        );
      }

      console.log(`✅ Article ${articleId} transitioned from ${currentStatus} to ${toStatus}`);

      return {
        success: true,
        message: `Artigo ${this.getStatusDisplayName(toStatus)} com sucesso`,
        article: updatedArticle,
      };

    } catch (error) {
      console.error('Error in workflow transition:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro na transição',
      };
    }
  }

  /**
   * Registrar histórico de workflow
   */
  private async recordWorkflowHistory(transition: Omit<WorkflowTransition, 'id' | 'createdAt'>): Promise<void> {
    try {
      await this.db.insert(workflowHistory).values({
        id: generateId(),
        ...transition,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error recording workflow history:', error);
      // Não falhar a transição por causa do histórico
    }
  }

  /**
   * Obter histórico de workflow para artigo
   */
  async getWorkflowHistory(articleId: string): Promise<WorkflowTransition[]> {
    try {
      const history = await this.db
        .select()
        .from(workflowHistory)
        .where(eq(workflowHistory.articleId, articleId))
        .orderBy(desc(workflowHistory.createdAt));

      return history;
    } catch (error) {
      console.error('Error getting workflow history:', error);
      return [];
    }
  }

  /**
   * Obter artigos por status
   */
  async getArticlesByStatus(
    status: WorkflowStatus | WorkflowStatus[],
    options: {
      page?: number;
      limit?: number;
      userId?: string; // Filtrar por usuário específico
      assignedTo?: string; // Artigos atribuídos a usuário
    } = {}
  ): Promise<{ articles: any[]; total: number; pagination: any }> {
    const { page = 1, limit = 20 } = options;
    
    try {
      const statusArray = Array.isArray(status) ? status : [status];
      
      let query = this.db
        .select()
        .from(articles)
        .where(
          statusArray.length === 1 
            ? eq(articles.status, statusArray[0])
            : sql`${articles.status} IN (${sql.join(statusArray.map(s => sql`${s}`), sql`, `)})`
        );

      // Filtros adicionais
      if (options.userId) {
        query = query.where(eq(articles.authorId, options.userId));
      }

      if (options.assignedTo) {
        query = query.where(eq(articles.assignedTo, options.assignedTo));
      }

      // Ordenação
      query = query.orderBy(desc(articles.updatedAt));

      // Paginação
      const offset = (page - 1) * limit;
      const results = await query.limit(limit).offset(offset);

      // Contar total
      let countQuery = this.db
        .select({ count: count() })
        .from(articles)
        .where(
          statusArray.length === 1 
            ? eq(articles.status, statusArray[0])
            : sql`${articles.status} IN (${sql.join(statusArray.map(s => sql`${s}`), sql`, `)})`
        );

      if (options.userId) {
        countQuery = countQuery.where(eq(articles.authorId, options.userId));
      }

      const [{ count: total }] = await countQuery;

      return {
        articles: results,
        total: Number(total),
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      };
    } catch (error) {
      console.error('Error getting articles by status:', error);
      return { articles: [], total: 0, pagination: { page, limit, total: 0, totalPages: 0 } };
    }
  }

  /**
   * Obter estatísticas do workflow
   */
  async getWorkflowStats(): Promise<WorkflowStats> {
    try {
      // Contagem por status
      const statusCountsQuery = await this.db
        .select({
          status: articles.status,
          count: count(),
        })
        .from(articles)
        .groupBy(articles.status);

      const statusCounts: Record<WorkflowStatus, number> = {
        beehiiv_pending: 0,
        draft: 0,
        review: 0,
        approved: 0,
        published: 0,
        archived: 0,
        rejected: 0,
      };

      statusCountsQuery.forEach(({ status, count }) => {
        if (status in statusCounts) {
          statusCounts[status as WorkflowStatus] = Number(count);
        }
      });

      // Artigos publicados hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const [{ count: publishedToday }] = await this.db
        .select({ count: count() })
        .from(articles)
        .where(
          and(
            eq(articles.status, 'published'),
            sql`${articles.publishedAt} >= ${today}`,
            sql`${articles.publishedAt} < ${tomorrow}`
          )
        );

      // Taxa de rejeição (últimos 30 dias)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [recentHistory] = await this.db
        .select({
          approved: count(sql`CASE WHEN ${workflowHistory.toStatus} = 'approved' THEN 1 END`),
          rejected: count(sql`CASE WHEN ${workflowHistory.toStatus} = 'rejected' THEN 1 END`),
        })
        .from(workflowHistory)
        .where(sql`${workflowHistory.createdAt} >= ${thirtyDaysAgo}`);

      const totalDecisions = Number(recentHistory.approved) + Number(recentHistory.rejected);
      const rejectionRate = totalDecisions > 0 
        ? (Number(recentHistory.rejected) / totalDecisions) * 100 
        : 0;

      return {
        statusCounts,
        pendingReview: statusCounts.review,
        approvedWaiting: statusCounts.approved,
        publishedToday: Number(publishedToday),
        rejectionRate: Math.round(rejectionRate * 100) / 100,
        averageApprovalTime: 0, // TODO: implementar cálculo complexo
      };

    } catch (error) {
      console.error('Error getting workflow stats:', error);
      return {
        statusCounts: {
          beehiiv_pending: 0,
          draft: 0,
          review: 0,
          approved: 0,
          published: 0,
          archived: 0,
          rejected: 0,
        },
        pendingReview: 0,
        approvedWaiting: 0,
        publishedToday: 0,
        rejectionRate: 0,
        averageApprovalTime: 0,
      };
    }
  }

  /**
   * Atribuir artigo a um editor
   */
  async assignArticle(
    articleId: string,
    assignedToUserId: string,
    assignedByUserId: string,
    assignedByUserName: string,
    assignedByUserRole: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const article = await this.articleRepository.findById(articleId);
      if (!article) {
        return { success: false, message: 'Artigo não encontrado' };
      }

      await this.articleRepository.update(articleId, {
        assignedTo: assignedToUserId,
        assignedAt: new Date(),
        assignedBy: assignedByUserId,
      });

      // Registrar no histórico
      await this.recordWorkflowHistory({
        articleId,
        fromStatus: article.status as WorkflowStatus,
        toStatus: article.status as WorkflowStatus,
        userId: assignedByUserId,
        userName: assignedByUserName,
        userRole: assignedByUserRole,
        reason: `Artigo atribuído a usuário ${assignedToUserId}`,
      });

      // Notificar o usuário atribuído
      await this.notificationService.notifyArticleAssigned(
        articleId,
        article.title,
        assignedToUserId,
        assignedByUserName
      );

      return { success: true, message: 'Artigo atribuído com sucesso' };
    } catch (error) {
      console.error('Error assigning article:', error);
      return { success: false, message: 'Erro ao atribuir artigo' };
    }
  }

  /**
   * Obter transições possíveis para um artigo
   */
  getAvailableTransitions(currentStatus: WorkflowStatus, userRole: string): WorkflowStatus[] {
    const allowedTransitions = WORKFLOW_TRANSITIONS[currentStatus] || [];
    const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
    
    return allowedTransitions.filter(status => rolePermissions.includes(status));
  }

  /**
   * Obter nome de exibição do status
   */
  private getStatusDisplayName(status: WorkflowStatus): string {
    const names: Record<WorkflowStatus, string> = {
      beehiiv_pending: 'aguardando revisão',
      draft: 'em rascunho',
      review: 'em revisão',
      approved: 'aprovado',
      published: 'publicado',
      archived: 'arquivado',
      rejected: 'rejeitado',
    };
    
    return names[status] || status;
  }

  /**
   * Publicação agendada automática
   */
  async processScheduledPublications(): Promise<{ published: number; errors: string[] }> {
    try {
      const now = new Date();
      
      // Buscar artigos aprovados com data de publicação agendada
      const scheduledArticles = await this.db
        .select()
        .from(articles)
        .where(
          and(
            eq(articles.status, 'approved'),
            sql`${articles.scheduledFor} <= ${now}`,
            sql`${articles.scheduledFor} IS NOT NULL`
          )
        );

      console.log(`📅 Processing ${scheduledArticles.length} scheduled articles`);

      let published = 0;
      const errors: string[] = [];

      for (const article of scheduledArticles) {
        try {
          const result = await this.transitionStatus(
            article.id,
            'published',
            'system',
            'Sistema',
            'admin',
            {
              reason: 'Publicação agendada automática',
              publishedAt: now,
            }
          );

          if (result.success) {
            published++;
            console.log(`✅ Auto-published: ${article.title}`);
          } else {
            errors.push(`${article.title}: ${result.message}`);
          }
        } catch (error) {
          const errorMessage = `${article.title}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
          errors.push(errorMessage);
          console.error('Error auto-publishing article:', error);
        }
      }

      return { published, errors };
    } catch (error) {
      console.error('Error processing scheduled publications:', error);
      return { published: 0, errors: ['Erro ao processar publicações agendadas'] };
    }
  }
}