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
  | 'solicitado_mudancas' // Solicitado mudanças pelo revisor
  | 'revisado'         // Revisado após mudanças solicitadas
  | 'approved'         // Aprovado, pronto para publicação
  | 'published'        // Publicado
  | 'archived'         // Arquivado
  | 'rejected';        // Rejeitado

// Transições permitidas
const WORKFLOW_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  beehiiv_pending: ['draft', 'review', 'archived'],
  draft: ['review', 'approved', 'published', 'archived', 'rejected'], // Adicionado 'published' para aprovação direta
  review: ['approved', 'published', 'draft', 'rejected', 'solicitado_mudancas'], // Adicionado 'solicitado_mudancas'
  solicitado_mudancas: ['revisado', 'draft', 'archived'], // Pode ser revisado ou voltar para draft
  revisado: ['review', 'approved', 'published'], // Volta para revisão ou aprovação
  approved: ['published', 'draft'],
  published: ['archived'],
  archived: ['draft'],
  rejected: ['draft', 'archived'],
};

// Permissões por role
const ROLE_PERMISSIONS: Record<string, WorkflowStatus[]> = {
  super_admin: ['beehiiv_pending', 'draft', 'review', 'solicitado_mudancas', 'revisado', 'approved', 'published', 'archived', 'rejected'], // Acesso total
  admin: ['beehiiv_pending', 'draft', 'review', 'solicitado_mudancas', 'revisado', 'approved', 'published', 'archived', 'rejected'],
  'editor-chefe': ['beehiiv_pending', 'draft', 'review', 'solicitado_mudancas', 'revisado', 'approved', 'published', 'rejected'],
  editor: ['beehiiv_pending', 'draft', 'review', 'solicitado_mudancas', 'revisado'],
  revisor: ['review', 'solicitado_mudancas', 'revisado', 'approved', 'rejected'],
  developer: ['beehiiv_pending', 'draft', 'review', 'solicitado_mudancas', 'revisado', 'approved', 'published', 'archived', 'rejected'],
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
    console.log('🔍 [CAN-TRANSITION] Verificando transição:', { fromStatus, toStatus, userRole });
    
    // Super admin tem acesso total
    if (userRole === 'super_admin') {
      console.log('👑 [CAN-TRANSITION] Super admin - acesso total concedido');
      return true;
    }
    
    // Verificar se transição é permitida
    const allowedTransitions = WORKFLOW_TRANSITIONS[fromStatus] || [];
    console.log('📋 [CAN-TRANSITION] Transições permitidas para', fromStatus, ':', allowedTransitions);
    
    if (!allowedTransitions.includes(toStatus)) {
      console.log('❌ [CAN-TRANSITION] Transição não permitida pelo workflow');
      return false;
    }

    // Verificar permissões do usuário
    const rolePermissions = ROLE_PERMISSIONS[userRole] || [];
    console.log('👤 [CAN-TRANSITION] Permissões do role', userRole, ':', rolePermissions);
    
    const hasPermission = rolePermissions.includes(toStatus);
    console.log('✅ [CAN-TRANSITION] Usuário tem permissão?', hasPermission);
    
    return hasPermission;
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
      console.log('🔄 [TRANSITION-STATUS] Iniciando transição:', { articleId, toStatus, userId, userRole });
      console.log('📝 [TRANSITION-STATUS] Opções recebidas:', options);

      // Buscar artigo atual
      const article = await this.articleRepository.findById(articleId);
      if (!article) {
        console.log('❌ [TRANSITION-STATUS] Artigo não encontrado:', articleId);
        return { success: false, message: 'Artigo não encontrado' };
      }

      const currentStatus = article.status as WorkflowStatus;
      console.log('📄 [TRANSITION-STATUS] Artigo encontrado:', { id: article.id, currentStatus, title: article.title });

      // Verificar se transição é válida
      if (!this.canTransition(currentStatus, toStatus, userRole)) {
        console.log('❌ [TRANSITION-STATUS] Transição não permitida:', { currentStatus, toStatus, userRole });
        return { 
          success: false, 
          message: `Transição de ${currentStatus} para ${toStatus} não permitida para ${userRole}` 
        };
      }

      console.log('✅ [TRANSITION-STATUS] Transição autorizada, prosseguindo...');

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

      console.log('📝 [TRANSITION-STATUS] Dados de atualização:', updateData);

      // Atualizar artigo
      const updatedArticle = await this.articleRepository.update(articleId, updateData);
      if (!updatedArticle) {
        console.log('❌ [TRANSITION-STATUS] Falha ao atualizar artigo');
        return { success: false, message: 'Falha ao atualizar artigo' };
      }
      console.log('✅ [TRANSITION-STATUS] Artigo atualizado com sucesso');

      // Registrar no histórico
      console.log('📝 [TRANSITION-STATUS] Registrando histórico com dados:', {
        articleId,
        fromStatus: currentStatus,
        toStatus,
        userId,
        userName,
        userRole,
        reason: options.reason,
        feedback: options.feedback,
      });
      
      try {
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
        console.log('✅ [TRANSITION-STATUS] Histórico registrado com sucesso');
      } catch (historyError) {
        console.error('❌ [TRANSITION-STATUS] Erro ao registrar histórico:', historyError);
        // Não falhar a transição por causa do histórico
      }

      // Enviar notificações baseadas no status
      try {
        switch (toStatus) {
          case 'review':
            // Não notificar mudanças de status gerais, apenas eventos específicos
            break;
          case 'solicitado_mudancas':
            await this.notificationService.notifyChangeRequest(
              updatedArticle,
              options.feedback || options.reason || 'Mudanças solicitadas',
              userName
            );
            break;
          case 'approved':
            await this.notificationService.notifyApproval(updatedArticle, userName);
            break;
          case 'published':
            await this.notificationService.notifyPublication(updatedArticle, userName);
            break;
          case 'rejected':
            await this.notificationService.notifyRejection(
              updatedArticle,
              options.reason || 'Artigo rejeitado',
              userName
            );
            break;
          case 'archived':
            await this.notificationService.notifyArchive(updatedArticle, userName);
            break;
          default:
            // Notificar mudança de status genérica
            await this.notificationService.notifyStatusChange(
              updatedArticle,
              currentStatus,
              toStatus,
              userName
            );
        }
      } catch (notificationError) {
        console.error('❌ [TRANSITION-STATUS] Erro ao enviar notificação:', notificationError);
        // Não falhar a transição por causa de notificação
      }

      // Article transitioned

      return {
        success: true,
        message: `Artigo ${this.getStatusDisplayName(toStatus)} com sucesso`,
        article: updatedArticle,
      };

    } catch (error) {
      console.error('❌ [TRANSITION-STATUS] Erro na transição:', error);
      console.error('❌ [TRANSITION-STATUS] Stack:', error instanceof Error ? error.stack : 'No stack');
      // Error in workflow transition
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro na transição',
      };
    }
  }

  /**
   * Registrar histórico de workflow
   */
  async recordWorkflowHistory(transition: Omit<WorkflowTransition, 'id' | 'createdAt'>): Promise<void> {
    try {
      console.log('📝 [RECORD-HISTORY] Registrando histórico:', transition);
      
      const historyData = {
        id: generateId(),
        ...transition,
        createdAt: new Date(),
      };
      
      console.log('📝 [RECORD-HISTORY] Dados para inserir:', historyData);
      console.log('📝 [RECORD-HISTORY] Tipo do banco:', typeof this.db);
      console.log('📝 [RECORD-HISTORY] Schema workflowHistory:', workflowHistory);
      
      const result = await this.db.insert(workflowHistory).values(historyData);
      console.log('📝 [RECORD-HISTORY] Resultado da inserção:', result);
      
      // Verificar se o registro foi inserido
      const verifyResult = await this.db.select().from(workflowHistory).where(eq(workflowHistory.id, historyData.id));
      console.log('📝 [RECORD-HISTORY] Verificação pós-inserção:', verifyResult);
      
      console.log('✅ [RECORD-HISTORY] Histórico registrado com sucesso');
    } catch (error) {
      console.error('❌ [RECORD-HISTORY] Erro ao registrar histórico:', error);
      console.error('❌ [RECORD-HISTORY] Stack trace:', error instanceof Error ? error.stack : 'No stack');
      // Error recording workflow history
      // Não falhar a transição por causa do histórico
    }
  }

  /**
   * Obter histórico de workflow para artigo
   */
  async getWorkflowHistory(articleId: string): Promise<WorkflowTransition[]> {
    try {
      console.log('🔍 [WORKFLOW-SERVICE] Buscando histórico para artigo:', articleId);
      console.log('🔍 [WORKFLOW-SERVICE] Tipo do banco:', typeof this.db);
      console.log('🔍 [WORKFLOW-SERVICE] Schema workflowHistory:', workflowHistory);
      
      const history = await this.db
        .select()
        .from(workflowHistory)
        .where(eq(workflowHistory.articleId, articleId))
        .orderBy(desc(workflowHistory.createdAt));

      console.log('📝 [WORKFLOW-SERVICE] Histórico encontrado:', history);
      console.log('📝 [WORKFLOW-SERVICE] Quantidade de registros:', history.length);
      
      if (history.length > 0) {
        console.log('📝 [WORKFLOW-SERVICE] Primeiro registro:', history[0]);
      }
      
      return history;
    } catch (error) {
      console.error('❌ [WORKFLOW-SERVICE] Erro ao buscar histórico:', error);
      console.error('❌ [WORKFLOW-SERVICE] Stack trace:', error instanceof Error ? error.stack : 'No stack');
      // Error getting workflow history
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
      // Error getting articles by status
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
      // Error getting workflow stats
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

      // TODO: Implementar notificação de atribuição de artigo
      // await this.notificationService.notifyArticleAssigned(...)

      return { success: true, message: 'Artigo atribuído com sucesso' };
    } catch (error) {
      // Error assigning article
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

      // Processing scheduled articles

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
            // Auto-published
          } else {
            errors.push(`${article.title}: ${result.message}`);
          }
        } catch (error) {
          const errorMessage = `${article.title}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`;
          errors.push(errorMessage);
          // Error auto-publishing article
        }
      }

      return { published, errors };
    } catch (error) {
      // Error processing scheduled publications
      return { published: 0, errors: ['Erro ao processar publicações agendadas'] };
    }
  }
}