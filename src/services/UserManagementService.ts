/**
 * Serviço de gestão completa de usuários
 * Expandido com recursos de autenticação, segurança e auditoria
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq, and, or, desc, asc, count, sql, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import { 
  userSessions, userInvitations, auditLogs, securityEvents, 
  permissionDefinitions, UserSession, UserInvitation 
} from '../config/db/schema';
import { CloudflareD1Client } from '../config/types/auth';

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
  avatar?: string | null;
  phone?: string | null;
  timezone?: string | null;
  language?: string | null;
  role: string;
  permissions?: string[];
  brandId?: string | null;
  brandName?: string | null;
  isActive: boolean;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  onboardingCompleted: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  
  // Statistics
  loginCount: number;
  
  // Additional computed fields
  displayName?: string;
  initials?: string;
}

export interface CreateUserData {
  email: string;
  password?: string; // Optional for invited users
  name?: string;
  firstName?: string;
  lastName?: string;
  role: string;
  permissions?: string[];
  brandId?: string;
  brandName?: string;
  bio?: string;
  phone?: string;
  timezone?: string;
  language?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  sendWelcomeEmail?: boolean;
}

export interface UpdateUserData {
  name?: string;
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatar?: string;
  phone?: string;
  timezone?: string;
  language?: string;
  role?: string;
  permissions?: string[];
  isActive?: boolean;
  brandId?: string;
  brandName?: string;
}

export interface UserSearchQuery {
  search?: string; // Search in name, email
  role?: string | string[];
  isActive?: boolean;
  emailVerified?: boolean;
  brandId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  lastLoginAfter?: Date;
  page?: number;
  limit?: number;
  sortBy?: 'name' | 'email' | 'createdAt' | 'lastLoginAt' | 'loginCount';
  sortOrder?: 'asc' | 'desc';
}

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  byRole: Record<string, number>;
  recentRegistrations: number; // Last 30 days
  recentLogins: number; // Last 24 hours
  topUsers: UserProfile[]; // Most active users
}

export interface LoginResult {
  success: boolean;
  message: string;
  token?: string;
  user?: UserProfile;
  requiresTwoFactor?: boolean;
  sessionId?: string;
}

export interface PasswordResetRequest {
  email: string;
  token: string;
  expiresAt: Date;
  requestIp: string;
  used: boolean;
}

export class UserManagementService {
  private db: DatabaseType;
  private d1Client?: CloudflareD1Client;

  constructor(db: DatabaseType, d1Client?: CloudflareD1Client) {
    this.db = db;
    this.d1Client = d1Client;
  }

  /**
   * Criar novo usuário
   */
  async createUser(
    data: CreateUserData,
    createdBy?: string,
    requestInfo?: { ip: string; userAgent: string }
  ): Promise<{ success: boolean; message: string; user?: UserProfile }> {
    try {
      console.log(`👤 Creating new user: ${data.email}`);

      // Verificar se email já existe
      const existingUser = await this.db
        .select()
        .from(users)
        .where(eq(users.email, data.email.toLowerCase()))
        .limit(1);

      if (existingUser.length > 0) {
        return { success: false, message: 'Email já está em uso' };
      }

      // Hash da senha se fornecida
      let passwordHash: string | undefined;
      if (data.password) {
        passwordHash = await bcrypt.hash(data.password, 12);
      }

      const userId = generateId();
      const now = new Date();

      // Criar usuário
      const [newUser] = await this.db
        .insert(users)
        .values({
          id: userId,
          email: data.email.toLowerCase(),
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          passwordHash,
          role: data.role,
          permissions: data.permissions ? JSON.stringify(data.permissions) : null,
          brandId: data.brandId,
          brandName: data.brandName,
          bio: data.bio,
          phone: data.phone,
          timezone: data.timezone || 'America/Sao_Paulo',
          language: data.language || 'pt-BR',
          isActive: data.isActive !== undefined ? data.isActive : true,
          emailVerified: data.emailVerified || false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Log da criação
      if (requestInfo && createdBy) {
        await this.logAuditEvent({
          userId: createdBy,
          action: 'create_user',
          resource: 'user',
          resourceId: userId,
          newValues: { email: data.email, role: data.role },
          ipAddress: requestInfo.ip,
          userAgent: requestInfo.userAgent,
          success: true,
        });
      }

      const userProfile = this.mapUserToProfile(newUser);

      console.log(`✅ User created successfully: ${userId}`);

      return {
        success: true,
        message: 'Usuário criado com sucesso',
        user: userProfile,
      };

    } catch (error) {
      console.error('Error creating user:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao criar usuário',
      };
    }
  }

  /**
   * Buscar usuário por ID
   */
  async getUserById(id: string): Promise<UserProfile | null> {
    try {
      // Se temos D1 client, usar ele para autenticação
      if (this.d1Client) {
        console.log(`🔍 Buscando usuário ${id} no D1...`);
        const result = await this.d1Client.execute(
          'SELECT * FROM users WHERE id = ? LIMIT 1', 
          [id]
        );
        
        if (!result.success || !result.result?.results || result.result.results.length === 0) {
          console.log(`❌ Usuário ${id} não encontrado no D1`);
          return null;
        }

        const user = result.result.results[0] as any;
        console.log(`✅ Usuário ${id} encontrado no D1:`, user.email);
        
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          firstName: user.firstName,
          lastName: user.lastName,
          bio: user.bio,
          avatar: user.avatar,
          phone: user.phone,
          timezone: user.timezone,
          language: user.language,
          role: user.role,
          permissions: user.permissions ? JSON.parse(user.permissions) : [],
          brandId: user.brandId,
          brandName: user.brandName,
          isActive: user.isActive,
          emailVerified: user.emailVerified,
          twoFactorEnabled: user.twoFactorEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        };
      }

      // Fallback para NEON (dados do CMS)
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      if (!user) return null;

      return this.mapUserToProfile(user);

    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  /**
   * Buscar usuário por email
   */
  async getUserByEmail(email: string): Promise<UserProfile | null> {
    try {
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase()))
        .limit(1);

      if (!user) return null;

      return this.mapUserToProfile(user);

    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  /**
   * Listar usuários com filtros e paginação
   */
  async listUsers(query: UserSearchQuery = {}): Promise<{
    users: UserProfile[];
    total: number;
    pagination: any;
  }> {
    try {
      const {
        search,
        role,
        isActive,
        emailVerified,
        brandId,
        createdAfter,
        createdBefore,
        lastLoginAfter,
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = query;

      // Construir condições WHERE
      const conditions = [];

      if (search) {
        conditions.push(
          or(
            sql`LOWER(${users.email}) LIKE ${`%${search.toLowerCase()}%`}`,
            sql`LOWER(${users.name}) LIKE ${`%${search.toLowerCase()}%`}`,
            sql`LOWER(${users.firstName}) LIKE ${`%${search.toLowerCase()}%`}`,
            sql`LOWER(${users.lastName}) LIKE ${`%${search.toLowerCase()}%`}`
          )
        );
      }

      if (role) {
        const roles = Array.isArray(role) ? role : [role];
        conditions.push(sql`${users.role} IN (${sql.join(roles.map(r => sql`${r}`), sql`, `)})`);
      }

      if (isActive !== undefined) {
        conditions.push(eq(users.isActive, isActive));
      }

      if (emailVerified !== undefined) {
        conditions.push(eq(users.emailVerified, emailVerified));
      }

      if (brandId) {
        conditions.push(eq(users.brandId, brandId));
      }

      if (createdAfter) {
        conditions.push(gte(users.createdAt, createdAfter));
      }

      if (createdBefore) {
        conditions.push(lte(users.createdAt, createdBefore));
      }

      if (lastLoginAfter) {
        conditions.push(
          and(
            isNotNull(users.lastLoginAt),
            gte(users.lastLoginAt, lastLoginAfter)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // Ordenação
      let orderBy;
      switch (sortBy) {
        case 'name':
          orderBy = sortOrder === 'asc' ? asc(users.name) : desc(users.name);
          break;
        case 'email':
          orderBy = sortOrder === 'asc' ? asc(users.email) : desc(users.email);
          break;
        case 'lastLoginAt':
          orderBy = sortOrder === 'asc' ? asc(users.lastLoginAt) : desc(users.lastLoginAt);
          break;
        case 'loginCount':
          orderBy = sortOrder === 'asc' ? asc(users.loginCount) : desc(users.loginCount);
          break;
        default:
          orderBy = sortOrder === 'asc' ? asc(users.createdAt) : desc(users.createdAt);
      }

      // Query principal
      const offset = (page - 1) * limit;
      const results = await this.db
        .select()
        .from(users)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);

      // Contar total
      const [{ count: total }] = await this.db
        .select({ count: count() })
        .from(users)
        .where(whereClause);

      const userProfiles = results.map(user => this.mapUserToProfile(user));

      return {
        users: userProfiles,
        total: Number(total),
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      };

    } catch (error) {
      console.error('Error listing users:', error);
      return { users: [], total: 0, pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    }
  }

  /**
   * Atualizar usuário
   */
  async updateUser(
    id: string,
    data: UpdateUserData,
    updatedBy?: string,
    requestInfo?: { ip: string; userAgent: string }
  ): Promise<{ success: boolean; message: string; user?: UserProfile }> {
    try {
      console.log(`✏️ Updating user: ${id}`);

      // Buscar usuário atual para auditoria
      const currentUser = await this.getUserById(id);
      if (!currentUser) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      const updateData: any = {
        updatedAt: new Date(),
      };

      // Mapear campos de atualização
      if (data.name !== undefined) updateData.name = data.name;
      if (data.firstName !== undefined) updateData.firstName = data.firstName;
      if (data.lastName !== undefined) updateData.lastName = data.lastName;
      if (data.bio !== undefined) updateData.bio = data.bio;
      if (data.avatar !== undefined) updateData.avatar = data.avatar;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.timezone !== undefined) updateData.timezone = data.timezone;
      if (data.language !== undefined) updateData.language = data.language;
      if (data.role !== undefined) updateData.role = data.role;
      if (data.permissions !== undefined) updateData.permissions = JSON.stringify(data.permissions);
      if (data.isActive !== undefined) updateData.isActive = data.isActive;
      if (data.brandId !== undefined) updateData.brandId = data.brandId;
      if (data.brandName !== undefined) updateData.brandName = data.brandName;

      const [updatedUser] = await this.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning();

      if (!updatedUser) {
        return { success: false, message: 'Falha ao atualizar usuário' };
      }

      // Log da atualização
      if (requestInfo && updatedBy) {
        const changes = this.getChangedFields(currentUser, data);
        await this.logAuditEvent({
          userId: updatedBy,
          action: 'update_user',
          resource: 'user',
          resourceId: id,
          oldValues: this.extractRelevantFields(currentUser),
          newValues: data,
          changes,
          ipAddress: requestInfo.ip,
          userAgent: requestInfo.userAgent,
          success: true,
        });
      }

      const userProfile = this.mapUserToProfile(updatedUser);

      console.log(`✅ User updated successfully: ${id}`);

      return {
        success: true,
        message: 'Usuário atualizado com sucesso',
        user: userProfile,
      };

    } catch (error) {
      console.error('Error updating user:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao atualizar usuário',
      };
    }
  }

  /**
   * Deletar/desativar usuário
   */
  async deleteUser(
    id: string,
    deletedBy?: string,
    requestInfo?: { ip: string; userAgent: string },
    softDelete: boolean = true
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🗑️ ${softDelete ? 'Deactivating' : 'Deleting'} user: ${id}`);

      const currentUser = await this.getUserById(id);
      if (!currentUser) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      if (softDelete) {
        // Soft delete: apenas desativar
        await this.db
          .update(users)
          .set({
            isActive: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));
      } else {
        // Hard delete
        await this.db
          .delete(users)
          .where(eq(users.id, id));
      }

      // Log da exclusão
      if (requestInfo && deletedBy) {
        await this.logAuditEvent({
          userId: deletedBy,
          action: softDelete ? 'deactivate_user' : 'delete_user',
          resource: 'user',
          resourceId: id,
          oldValues: this.extractRelevantFields(currentUser),
          ipAddress: requestInfo.ip,
          userAgent: requestInfo.userAgent,
          success: true,
        });
      }

      console.log(`✅ User ${softDelete ? 'deactivated' : 'deleted'}: ${id}`);

      return {
        success: true,
        message: `Usuário ${softDelete ? 'desativado' : 'removido'} com sucesso`,
      };

    } catch (error) {
      console.error('Error deleting user:', error);
      return {
        success: false,
        message: 'Erro ao remover usuário',
      };
    }
  }

  /**
   * Obter estatísticas de usuários
   */
  async getUserStats(): Promise<UserStats> {
    try {
      // Contagens básicas
      const [
        { count: totalUsers },
        { count: activeUsers },
        { count: verifiedUsers }
      ] = await Promise.all([
        this.db.select({ count: count() }).from(users),
        this.db.select({ count: count() }).from(users).where(eq(users.isActive, true)),
        this.db.select({ count: count() }).from(users).where(eq(users.emailVerified, true))
      ]);

      // Contagem por role
      const roleStats = await this.db
        .select({
          role: users.role,
          count: count(),
        })
        .from(users)
        .where(eq(users.isActive, true))
        .groupBy(users.role);

      const byRole: Record<string, number> = {};
      roleStats.forEach(stat => {
        byRole[stat.role] = Number(stat.count);
      });

      // Registros recentes (últimos 30 dias)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [{ count: recentRegistrations }] = await this.db
        .select({ count: count() })
        .from(users)
        .where(gte(users.createdAt, thirtyDaysAgo));

      // Logins recentes (últimas 24 horas)
      const oneDayAgo = new Date();
      oneDayAgo.setHours(oneDayAgo.getHours() - 24);

      const [{ count: recentLogins }] = await this.db
        .select({ count: count() })
        .from(users)
        .where(
          and(
            isNotNull(users.lastLoginAt),
            gte(users.lastLoginAt, oneDayAgo)
          )
        );

      // Top usuários (mais ativos)
      const topUsersData = await this.db
        .select()
        .from(users)
        .where(eq(users.isActive, true))
        .orderBy(desc(users.loginCount))
        .limit(10);

      const topUsers = topUsersData.map(user => this.mapUserToProfile(user));

      return {
        totalUsers: Number(totalUsers),
        activeUsers: Number(activeUsers),
        inactiveUsers: Number(totalUsers) - Number(activeUsers),
        verifiedUsers: Number(verifiedUsers),
        unverifiedUsers: Number(totalUsers) - Number(verifiedUsers),
        byRole,
        recentRegistrations: Number(recentRegistrations),
        recentLogins: Number(recentLogins),
        topUsers,
      };

    } catch (error) {
      console.error('Error getting user stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        inactiveUsers: 0,
        verifiedUsers: 0,
        unverifiedUsers: 0,
        byRole: {},
        recentRegistrations: 0,
        recentLogins: 0,
        topUsers: [],
      };
    }
  }

  /**
   * Verificar senha
   */
  async verifyPassword(userId: string, password: string): Promise<boolean> {
    try {
      const [user] = await this.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user || !user.passwordHash) return false;

      return await bcrypt.compare(password, user.passwordHash);

    } catch (error) {
      console.error('Error verifying password:', error);
      return false;
    }
  }

  /**
   * Atualizar senha
   */
  async updatePassword(
    userId: string,
    newPassword: string,
    updatedBy?: string,
    requestInfo?: { ip: string; userAgent: string }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const passwordHash = await bcrypt.hash(newPassword, 12);

      await this.db
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      // Log da alteração de senha
      if (requestInfo && updatedBy) {
        await this.logAuditEvent({
          userId: updatedBy,
          action: 'change_password',
          resource: 'user',
          resourceId: userId,
          ipAddress: requestInfo.ip,
          userAgent: requestInfo.userAgent,
          success: true,
        });
      }

      return {
        success: true,
        message: 'Senha atualizada com sucesso',
      };

    } catch (error) {
      console.error('Error updating password:', error);
      return {
        success: false,
        message: 'Erro ao atualizar senha',
      };
    }
  }

  /**
   * Log de evento de auditoria
   */
  private async logAuditEvent(event: {
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
  }): Promise<void> {
    try {
      await this.db.insert(auditLogs).values({
        id: generateId(),
        ...event,
        oldValues: event.oldValues ? JSON.stringify(event.oldValues) : null,
        newValues: event.newValues ? JSON.stringify(event.newValues) : null,
        changes: event.changes ? JSON.stringify(event.changes) : null,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
        tags: event.tags ? JSON.stringify(event.tags) : null,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error logging audit event:', error);
    }
  }

  /**
   * Mapear usuário do banco para profile
   */
  private mapUserToProfile(user: any): UserProfile {
    const displayName = user.name || 
      (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : '') ||
      user.firstName || 
      user.email.split('@')[0];

    const initials = user.firstName && user.lastName 
      ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
      : user.name 
        ? user.name.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()
        : user.email.substring(0, 2).toUpperCase();

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      avatar: user.avatar,
      phone: user.phone,
      timezone: user.timezone,
      language: user.language,
      role: user.role,
      permissions: user.permissions ? JSON.parse(user.permissions) : [],
      brandId: user.brandId,
      brandName: user.brandName,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      onboardingCompleted: user.onboardingCompleted,
      lastLoginAt: user.lastLoginAt,
      loginCount: user.loginCount || 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      displayName,
      initials,
    };
  }

  /**
   * Obter campos alterados para auditoria
   */
  private getChangedFields(current: UserProfile, updates: UpdateUserData): any {
    const changes: any = {};
    
    Object.keys(updates).forEach(key => {
      const currentValue = (current as any)[key];
      const newValue = (updates as any)[key];
      
      if (currentValue !== newValue) {
        changes[key] = { from: currentValue, to: newValue };
      }
    });

    return changes;
  }

  /**
   * Extrair campos relevantes para auditoria
   */
  private extractRelevantFields(user: UserProfile): any {
    return {
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      permissions: user.permissions,
    };
  }
}