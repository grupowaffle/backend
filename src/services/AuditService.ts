/**
 * Serviço de auditoria e logs de segurança
 * Gerencia logs de auditoria e eventos de segurança
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import { eq, and, or, desc, asc, count, gte, lte, sql } from 'drizzle-orm';
import { auditLogs, securityEvents, users } from '../config/db/schema';

export interface AuditEvent {
  userId?: string;
  userName?: string;
  userEmail?: string;
  sessionId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  method?: string;
  endpoint?: string;
  userAgent?: string;
  ipAddress: string;
  location?: string;
  oldValues?: any;
  newValues?: any;
  changes?: any;
  success: boolean;
  errorMessage?: string;
  statusCode?: number;
  metadata?: any;
  tags?: string[];
}

export interface SecurityEventData {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  userId?: string;
  userEmail?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
  location?: string;
  deviceFingerprint?: string;
  description: string;
  additionalData?: any;
}

export interface AuditLogQuery {
  userId?: string;
  action?: string | string[];
  resource?: string | string[];
  success?: boolean;
  startDate?: Date;
  endDate?: Date;
  ipAddress?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'action' | 'userName';
  sortOrder?: 'asc' | 'desc';
}

export interface SecurityEventQuery {
  eventType?: string | string[];
  severity?: string | string[];
  category?: string;
  resolved?: boolean;
  startDate?: Date;
  endDate?: Date;
  userId?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'severity' | 'eventType';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditStats {
  totalLogs: number;
  successfulActions: number;
  failedActions: number;
  uniqueUsers: number;
  uniqueIPs: number;
  topActions: { action: string; count: number }[];
  topUsers: { userId: string; userName: string; count: number }[];
  dailyActivity: { date: string; count: number }[];
}

export interface SecurityStats {
  totalEvents: number;
  unresolvedEvents: number;
  criticalEvents: number;
  recentEvents: number; // Last 24 hours
  eventsBySeverity: Record<string, number>;
  eventsByType: Record<string, number>;
  topIPs: { ipAddress: string; count: number }[];
}

export class AuditService {
  private db: DatabaseType;

  constructor(db: DatabaseType) {
    this.db = db;
  }

  /**
   * Registrar evento de auditoria
   */
  async logAuditEvent(event: AuditEvent): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        id: generateId(),
        userId: event.userId,
        userName: event.userName,
        userEmail: event.userEmail,
        sessionId: event.sessionId,
        action: event.action,
        resource: event.resource,
        resourceId: event.resourceId,
        method: event.method,
        endpoint: event.endpoint,
        userAgent: event.userAgent,
        ipAddress: event.ipAddress,
        location: event.location,
        oldValues: event.oldValues ? JSON.stringify(event.oldValues) : null,
        newValues: event.newValues ? JSON.stringify(event.newValues) : null,
        changes: event.changes ? JSON.stringify(event.changes) : null,
        success: event.success,
        errorMessage: event.errorMessage,
        statusCode: event.statusCode,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        tags: event.tags ? JSON.stringify(event.tags) : null,
        createdAt: new Date(),
      });

      console.log(`📋 Audit event logged: ${event.action} by ${event.userName || event.userEmail || 'unknown'}`);

    } catch (error) {
      console.error('Error logging audit event:', error);
      // Não falhar a operação principal por causa do log
    }
  }

  /**
   * Registrar evento de segurança
   */
  async logSecurityEvent(event: SecurityEventData): Promise<string | null> {
    try {
      const eventId = generateId();

      await this.db.insert(securityEvents).values({
        id: eventId,
        eventType: event.eventType,
        severity: event.severity,
        category: event.category,
        userId: event.userId,
        userEmail: event.userEmail,
        sessionId: event.sessionId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        location: event.location,
        deviceFingerprint: event.deviceFingerprint,
        description: event.description,
        additionalData: event.additionalData ? JSON.stringify(event.additionalData) : null,
        resolved: false,
        createdAt: new Date(),
      });

      console.log(`🚨 Security event logged: ${event.eventType} (${event.severity}) - ${event.description}`);

      return eventId;

    } catch (error) {
      console.error('Error logging security event:', error);
      return null;
    }
  }

  /**
   * Buscar logs de auditoria
   */
  async getAuditLogs(query: AuditLogQuery = {}): Promise<{
    logs: any[];
    total: number;
    pagination: any;
  }> {
    try {
      const {
        userId,
        action,
        resource,
        success,
        startDate,
        endDate,
        ipAddress,
        search,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      // Construir condições WHERE
      const conditions = [];

      if (userId) {
        conditions.push(eq(auditLogs.userId, userId));
      }

      if (action) {
        const actions = Array.isArray(action) ? action : [action];
        conditions.push(sql`${auditLogs.action} IN (${sql.join(actions.map(a => sql`${a}`), sql`, `)})`);
      }

      if (resource) {
        const resources = Array.isArray(resource) ? resource : [resource];
        conditions.push(sql`${auditLogs.resource} IN (${sql.join(resources.map(r => sql`${r}`), sql`, `)})`);
      }

      if (success !== undefined) {
        conditions.push(eq(auditLogs.success, success));
      }

      if (startDate) {
        conditions.push(gte(auditLogs.createdAt, startDate));
      }

      if (endDate) {
        conditions.push(lte(auditLogs.createdAt, endDate));
      }

      if (ipAddress) {
        conditions.push(eq(auditLogs.ipAddress, ipAddress));
      }

      if (search) {
        conditions.push(
          or(
            sql`LOWER(${auditLogs.action}) LIKE ${`%${search.toLowerCase()}%`}`,
            sql`LOWER(${auditLogs.userName}) LIKE ${`%${search.toLowerCase()}%`}`,
            sql`LOWER(${auditLogs.userEmail}) LIKE ${`%${search.toLowerCase()}%`}`,
            sql`LOWER(${auditLogs.endpoint}) LIKE ${`%${search.toLowerCase()}%`}`
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Ordenação
      let orderBy;
      switch (sortBy) {
        case 'action':
          orderBy = sortOrder === 'asc' ? asc(auditLogs.action) : desc(auditLogs.action);
          break;
        case 'userName':
          orderBy = sortOrder === 'asc' ? asc(auditLogs.userName) : desc(auditLogs.userName);
          break;
        default:
          orderBy = sortOrder === 'asc' ? asc(auditLogs.createdAt) : desc(auditLogs.createdAt);
      }

      // Query principal
      const offset = (page - 1) * limit;
      const logs = await this.db
        .select()
        .from(auditLogs)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      // Contar total
      const [{ count: total }] = await this.db
        .select({ count: count() })
        .from(auditLogs)
        .where(whereClause);

      // Parse JSON fields
      const parsedLogs = logs.map(log => ({
        ...log,
        oldValues: log.oldValues ? JSON.parse(log.oldValues) : null,
        newValues: log.newValues ? JSON.parse(log.newValues) : null,
        changes: log.changes ? JSON.parse(log.changes) : null,
        metadata: log.metadata ? JSON.parse(log.metadata) : null,
        tags: log.tags ? JSON.parse(log.tags) : null,
      }));

      return {
        logs: parsedLogs,
        total: Number(total),
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      };

    } catch (error) {
      console.error('Error getting audit logs:', error);
      return { logs: [], total: 0, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
    }
  }

  /**
   * Buscar eventos de segurança
   */
  async getSecurityEvents(query: SecurityEventQuery = {}): Promise<{
    events: any[];
    total: number;
    pagination: any;
  }> {
    try {
      const {
        eventType,
        severity,
        category,
        resolved,
        startDate,
        endDate,
        userId,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      // Construir condições WHERE
      const conditions = [];

      if (eventType) {
        const types = Array.isArray(eventType) ? eventType : [eventType];
        conditions.push(sql`${securityEvents.eventType} IN (${sql.join(types.map(t => sql`${t}`), sql`, `)})`);
      }

      if (severity) {
        const severities = Array.isArray(severity) ? severity : [severity];
        conditions.push(sql`${securityEvents.severity} IN (${sql.join(severities.map(s => sql`${s}`), sql`, `)})`);
      }

      if (category) {
        conditions.push(eq(securityEvents.category, category));
      }

      if (resolved !== undefined) {
        conditions.push(eq(securityEvents.resolved, resolved));
      }

      if (startDate) {
        conditions.push(gte(securityEvents.createdAt, startDate));
      }

      if (endDate) {
        conditions.push(lte(securityEvents.createdAt, endDate));
      }

      if (userId) {
        conditions.push(eq(securityEvents.userId, userId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Ordenação
      let orderBy;
      switch (sortBy) {
        case 'severity':
          orderBy = sortOrder === 'asc' ? asc(securityEvents.severity) : desc(securityEvents.severity);
          break;
        case 'eventType':
          orderBy = sortOrder === 'asc' ? asc(securityEvents.eventType) : desc(securityEvents.eventType);
          break;
        default:
          orderBy = sortOrder === 'asc' ? asc(securityEvents.createdAt) : desc(securityEvents.createdAt);
      }

      // Query principal
      const offset = (page - 1) * limit;
      const events = await this.db
        .select()
        .from(securityEvents)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      // Contar total
      const [{ count: total }] = await this.db
        .select({ count: count() })
        .from(securityEvents)
        .where(whereClause);

      // Parse JSON fields
      const parsedEvents = events.map(event => ({
        ...event,
        additionalData: event.additionalData ? JSON.parse(event.additionalData) : null,
      }));

      return {
        events: parsedEvents,
        total: Number(total),
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      };

    } catch (error) {
      console.error('Error getting security events:', error);
      return { events: [], total: 0, pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
    }
  }

  /**
   * Resolver evento de segurança
   */
  async resolveSecurityEvent(
    eventId: string,
    resolvedBy: string,
    resolution: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`✅ Resolving security event: ${eventId}`);

      const [updated] = await this.db
        .update(securityEvents)
        .set({
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy,
          resolution,
        })
        .where(eq(securityEvents.id, eventId))
        .returning();

      if (!updated) {
        return { success: false, message: 'Evento não encontrado' };
      }

      console.log(`✅ Security event resolved: ${eventId}`);

      return {
        success: true,
        message: 'Evento de segurança resolvido com sucesso',
      };

    } catch (error) {
      console.error('Error resolving security event:', error);
      return {
        success: false,
        message: 'Erro ao resolver evento de segurança',
      };
    }
  }

  /**
   * Obter estatísticas de auditoria
   */
  async getAuditStats(days: number = 30): Promise<AuditStats> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Contagens básicas
      const [
        { count: totalLogs },
        { count: successfulActions },
        { count: failedActions },
        { count: uniqueUsers },
        { count: uniqueIPs }
      ] = await Promise.all([
        this.db.select({ count: count() }).from(auditLogs).where(gte(auditLogs.createdAt, startDate)),
        this.db.select({ count: count() }).from(auditLogs).where(and(gte(auditLogs.createdAt, startDate), eq(auditLogs.success, true))),
        this.db.select({ count: count() }).from(auditLogs).where(and(gte(auditLogs.createdAt, startDate), eq(auditLogs.success, false))),
        this.db.select({ count: sql<number>`COUNT(DISTINCT ${auditLogs.userId})` }).from(auditLogs).where(gte(auditLogs.createdAt, startDate)),
        this.db.select({ count: sql<number>`COUNT(DISTINCT ${auditLogs.ipAddress})` }).from(auditLogs).where(gte(auditLogs.createdAt, startDate))
      ]);

      // Top actions
      const topActions = await this.db
        .select({
          action: auditLogs.action,
          count: count(),
        })
        .from(auditLogs)
        .where(gte(auditLogs.createdAt, startDate))
        .groupBy(auditLogs.action)
        .orderBy(desc(count()))
        .limit(10);

      // Top users
      const topUsers = await this.db
        .select({
          userId: auditLogs.userId,
          userName: auditLogs.userName,
          count: count(),
        })
        .from(auditLogs)
        .where(and(gte(auditLogs.createdAt, startDate), sql`${auditLogs.userId} IS NOT NULL`))
        .groupBy(auditLogs.userId, auditLogs.userName)
        .orderBy(desc(count()))
        .limit(10);

      // Atividade diária (últimos 7 dias)
      const dailyActivity: { date: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const dayStart = new Date(date);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(date);
        dayEnd.setHours(23, 59, 59, 999);

        const [{ count }] = await this.db
          .select({ count: count() })
          .from(auditLogs)
          .where(and(gte(auditLogs.createdAt, dayStart), lte(auditLogs.createdAt, dayEnd)));

        dailyActivity.push({ date: dateStr, count: Number(count) });
      }

      return {
        totalLogs: Number(totalLogs),
        successfulActions: Number(successfulActions),
        failedActions: Number(failedActions),
        uniqueUsers: Number(uniqueUsers),
        uniqueIPs: Number(uniqueIPs),
        topActions: topActions.map(item => ({ action: item.action, count: Number(item.count) })),
        topUsers: topUsers.map(item => ({ 
          userId: item.userId || '', 
          userName: item.userName || 'Unknown', 
          count: Number(item.count) 
        })),
        dailyActivity,
      };

    } catch (error) {
      console.error('Error getting audit stats:', error);
      return {
        totalLogs: 0,
        successfulActions: 0,
        failedActions: 0,
        uniqueUsers: 0,
        uniqueIPs: 0,
        topActions: [],
        topUsers: [],
        dailyActivity: [],
      };
    }
  }

  /**
   * Obter estatísticas de segurança
   */
  async getSecurityStats(): Promise<SecurityStats> {
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      // Contagens básicas
      const [
        { count: totalEvents },
        { count: unresolvedEvents },
        { count: criticalEvents },
        { count: recentEvents }
      ] = await Promise.all([
        this.db.select({ count: count() }).from(securityEvents),
        this.db.select({ count: count() }).from(securityEvents).where(eq(securityEvents.resolved, false)),
        this.db.select({ count: count() }).from(securityEvents).where(eq(securityEvents.severity, 'critical')),
        this.db.select({ count: count() }).from(securityEvents).where(gte(securityEvents.createdAt, oneDayAgo))
      ]);

      // Eventos por severidade
      const severityStats = await this.db
        .select({
          severity: securityEvents.severity,
          count: count(),
        })
        .from(securityEvents)
        .groupBy(securityEvents.severity);

      const eventsBySeverity: Record<string, number> = {};
      severityStats.forEach(stat => {
        eventsBySeverity[stat.severity] = Number(stat.count);
      });

      // Eventos por tipo
      const typeStats = await this.db
        .select({
          eventType: securityEvents.eventType,
          count: count(),
        })
        .from(securityEvents)
        .groupBy(securityEvents.eventType)
        .orderBy(desc(count()))
        .limit(10);

      const eventsByType: Record<string, number> = {};
      typeStats.forEach(stat => {
        eventsByType[stat.eventType] = Number(stat.count);
      });

      // Top IPs
      const topIPs = await this.db
        .select({
          ipAddress: securityEvents.ipAddress,
          count: count(),
        })
        .from(securityEvents)
        .groupBy(securityEvents.ipAddress)
        .orderBy(desc(count()))
        .limit(10);

      return {
        totalEvents: Number(totalEvents),
        unresolvedEvents: Number(unresolvedEvents),
        criticalEvents: Number(criticalEvents),
        recentEvents: Number(recentEvents),
        eventsBySeverity,
        eventsByType,
        topIPs: topIPs.map(item => ({ ipAddress: item.ipAddress, count: Number(item.count) })),
      };

    } catch (error) {
      console.error('Error getting security stats:', error);
      return {
        totalEvents: 0,
        unresolvedEvents: 0,
        criticalEvents: 0,
        recentEvents: 0,
        eventsBySeverity: {},
        eventsByType: {},
        topIPs: [],
      };
    }
  }

  /**
   * Limpar logs antigos
   */
  async cleanupOldLogs(
    auditLogsDays: number = 90,
    securityEventsDays: number = 365
  ): Promise<{ auditLogsDeleted: number; securityEventsDeleted: number }> {
    try {
      console.log(`🧹 Cleaning up old logs (audit: ${auditLogsDays}d, security: ${securityEventsDays}d)`);

      const auditCutoff = new Date();
      auditCutoff.setDate(auditCutoff.getDate() - auditLogsDays);

      const securityCutoff = new Date();
      securityCutoff.setDate(securityCutoff.getDate() - securityEventsDays);

      // Deletar logs antigos
      const deletedAuditLogs = await this.db
        .delete(auditLogs)
        .where(lte(auditLogs.createdAt, auditCutoff))
        .returning();

      // Deletar eventos de segurança antigos (apenas os resolvidos)
      const deletedSecurityEvents = await this.db
        .delete(securityEvents)
        .where(
          and(
            lte(securityEvents.createdAt, securityCutoff),
            eq(securityEvents.resolved, true)
          )
        )
        .returning();

      console.log(`✅ Cleanup completed: ${deletedAuditLogs.length} audit logs, ${deletedSecurityEvents.length} security events`);

      return {
        auditLogsDeleted: deletedAuditLogs.length,
        securityEventsDeleted: deletedSecurityEvents.length,
      };

    } catch (error) {
      console.error('Error cleaning up old logs:', error);
      return {
        auditLogsDeleted: 0,
        securityEventsDeleted: 0,
      };
    }
  }

  /**
   * Detectar atividades suspeitas automáticas
   */
  async detectSuspiciousActivity(): Promise<{
    suspiciousIPs: string[];
    failedLoginAttempts: any[];
    unusualAccess: any[];
  }> {
    try {
      console.log('🔍 Detecting suspicious activity');

      const oneHourAgo = new Date();
      oneHourAgo.setHours(oneHourAgo.getHours() - 1);

      // IPs com muitas tentativas falhadas
      const suspiciousIPs = await this.db
        .select({
          ipAddress: auditLogs.ipAddress,
          count: count(),
        })
        .from(auditLogs)
        .where(
          and(
            gte(auditLogs.createdAt, oneHourAgo),
            eq(auditLogs.success, false),
            sql`${auditLogs.action} IN ('login', 'api_access')`
          )
        )
        .groupBy(auditLogs.ipAddress)
        .having(sql`COUNT(*) >= 5`)
        .orderBy(desc(count()));

      // Tentativas de login falhadas recentes
      const failedLoginAttempts = await this.db
        .select()
        .from(auditLogs)
        .where(
          and(
            gte(auditLogs.createdAt, oneHourAgo),
            eq(auditLogs.action, 'login'),
            eq(auditLogs.success, false)
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(20);

      // Acessos incomuns (usuários acessando fora do horário normal)
      const now = new Date();
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      const isNightTime = now.getHours() < 6 || now.getHours() > 22;

      const unusualAccess = [];
      if (isWeekend || isNightTime) {
        const recentAccess = await this.db
          .select()
          .from(auditLogs)
          .where(
            and(
              gte(auditLogs.createdAt, oneHourAgo),
              eq(auditLogs.success, true),
              sql`${auditLogs.userId} IS NOT NULL`
            )
          )
          .orderBy(desc(auditLogs.createdAt))
          .limit(10);

        unusualAccess.push(...recentAccess);
      }

      return {
        suspiciousIPs: suspiciousIPs.map(item => item.ipAddress),
        failedLoginAttempts,
        unusualAccess,
      };

    } catch (error) {
      console.error('Error detecting suspicious activity:', error);
      return {
        suspiciousIPs: [],
        failedLoginAttempts: [],
        unusualAccess: [],
      };
    }
  }
}