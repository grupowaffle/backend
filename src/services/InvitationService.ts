/**
 * Serviço de convites e onboarding
 * Gerencia convites de usuários, aceitação e processo de onboarding
 */

import { DatabaseType } from '../repositories/BaseRepository';
import { generateId } from '../lib/cuid';
import crypto from 'crypto';
import { eq, and, desc, count, gte, lte } from 'drizzle-orm';
import { 
  userInvitations, users, UserInvitation, NewUserInvitation, NewUser 
} from '../config/db/schema';
import bcrypt from 'bcryptjs';

export interface InviteUserData {
  email: string;
  role: string;
  permissions?: string[];
  brandId?: string;
  brandName?: string;
  message?: string;
  expiresInDays?: number;
}

export interface AcceptInvitationData {
  inviteToken: string;
  firstName: string;
  lastName: string;
  password: string;
  timezone?: string;
  language?: string;
}

export interface InvitationResult {
  success: boolean;
  message: string;
  invitation?: InvitationWithDetails;
  inviteUrl?: string;
}

export interface AcceptInvitationResult {
  success: boolean;
  message: string;
  user?: any;
  token?: string;
}

export interface InvitationWithDetails {
  id: string;
  email: string;
  role: string;
  permissions?: string[];
  message?: string;
  status: string;
  brandId?: string;
  brandName?: string;
  invitedBy: string;
  invitedByName?: string;
  invitedByEmail?: string;
  expiresAt: Date;
  createdAt: Date;
  
  // Status booleans
  isPending: boolean;
  isExpired: boolean;
  isAccepted: boolean;
  isRevoked: boolean;
}

export interface OnboardingStep {
  id: string;
  name: string;
  title: string;
  description: string;
  completed: boolean;
  required: boolean;
  order: number;
}

export interface OnboardingProgress {
  userId: string;
  completedSteps: string[];
  totalSteps: number;
  completedCount: number;
  progress: number; // 0-100
  isCompleted: boolean;
  nextStep?: OnboardingStep;
}

export class InvitationService {
  private db: DatabaseType;
  private baseUrl: string;

  constructor(db: DatabaseType, baseUrl: string = 'https://cms.thenews.com.br') {
    this.db = db;
    this.baseUrl = baseUrl;
  }

  /**
   * Enviar convite para novo usuário
   */
  async inviteUser(
    data: InviteUserData,
    invitedBy: string,
    inviterName: string
  ): Promise<InvitationResult> {
    try {
      console.log(`📧 Inviting user: ${data.email} by ${inviterName}`);

      // Verificar se email já está em uso
      const existingUser = await this.db
        .select()
        .from(users)
        .where(eq(users.email, data.email.toLowerCase()))
        .limit(1);

      if (existingUser.length > 0) {
        return { success: false, message: 'Email já está em uso' };
      }

      // Verificar se já existe convite pendente
      const existingInvitation = await this.db
        .select()
        .from(userInvitations)
        .where(
          and(
            eq(userInvitations.email, data.email.toLowerCase()),
            eq(userInvitations.status, 'pending')
          )
        )
        .limit(1);

      if (existingInvitation.length > 0) {
        return { success: false, message: 'Convite pendente já existe para este email' };
      }

      // Gerar token único
      const inviteToken = crypto.randomBytes(32).toString('hex');
      
      // Calcular data de expiração
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (data.expiresInDays || 7));

      const invitationId = generateId();
      const now = new Date();

      // Criar convite
      const [newInvitation] = await this.db
        .insert(userInvitations)
        .values({
          id: invitationId,
          email: data.email.toLowerCase(),
          role: data.role,
          permissions: data.permissions ? JSON.stringify(data.permissions) : null,
          invitedBy,
          inviteToken,
          message: data.message,
          status: 'pending',
          brandId: data.brandId,
          brandName: data.brandName,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Buscar dados do convite com detalhes do convidador
      const invitationWithDetails = await this.getInvitationWithDetails(invitationId);

      // Gerar URL do convite
      const inviteUrl = `${this.baseUrl}/accept-invitation?token=${inviteToken}`;

      console.log(`✅ Invitation sent: ${invitationId}`);

      return {
        success: true,
        message: 'Convite enviado com sucesso',
        invitation: invitationWithDetails!,
        inviteUrl,
      };

    } catch (error) {
      console.error('Error inviting user:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao enviar convite',
      };
    }
  }

  /**
   * Aceitar convite
   */
  async acceptInvitation(data: AcceptInvitationData): Promise<AcceptInvitationResult> {
    try {
      console.log(`📧 Accepting invitation with token: ${data.inviteToken.substring(0, 8)}...`);

      // Buscar convite
      const [invitation] = await this.db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.inviteToken, data.inviteToken))
        .limit(1);

      if (!invitation) {
        return { success: false, message: 'Convite não encontrado' };
      }

      if (invitation.status !== 'pending') {
        return { success: false, message: 'Este convite já foi utilizado ou revogado' };
      }

      if (invitation.expiresAt < new Date()) {
        // Marcar como expirado
        await this.db
          .update(userInvitations)
          .set({ status: 'expired', updatedAt: new Date() })
          .where(eq(userInvitations.id, invitation.id));

        return { success: false, message: 'Este convite expirou' };
      }

      // Verificar se email não foi usado enquanto isso
      const existingUser = await this.db
        .select()
        .from(users)
        .where(eq(users.email, invitation.email))
        .limit(1);

      if (existingUser.length > 0) {
        return { success: false, message: 'Email já está em uso' };
      }

      // Hash da senha
      const passwordHash = await bcrypt.hash(data.password, 12);

      const userId = generateId();
      const now = new Date();

      // Criar usuário
      const [newUser] = await this.db
        .insert(users)
        .values({
          id: userId,
          email: invitation.email,
          firstName: data.firstName,
          lastName: data.lastName,
          name: `${data.firstName} ${data.lastName}`,
          passwordHash,
          role: invitation.role,
          permissions: invitation.permissions,
          brandId: invitation.brandId,
          brandName: invitation.brandName,
          timezone: data.timezone || 'America/Sao_Paulo',
          language: data.language || 'pt-BR',
          isActive: true,
          emailVerified: true, // Convites são considerados verificados
          emailVerifiedAt: now,
          invitedBy: invitation.invitedBy,
          invitedAt: invitation.createdAt,
          onboardingCompleted: false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // Marcar convite como aceito
      await this.db
        .update(userInvitations)
        .set({
          status: 'accepted',
          acceptedAt: now,
          acceptedBy: userId,
          updatedAt: now,
        })
        .where(eq(userInvitations.id, invitation.id));

      console.log(`✅ Invitation accepted: ${userId}`);

      return {
        success: true,
        message: 'Convite aceito com sucesso. Bem-vindo!',
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          onboardingCompleted: false,
        },
      };

    } catch (error) {
      console.error('Error accepting invitation:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erro ao aceitar convite',
      };
    }
  }

  /**
   * Revogar convite
   */
  async revokeInvitation(
    invitationId: string,
    revokedBy: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🚫 Revoking invitation: ${invitationId}`);

      const [invitation] = await this.db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.id, invitationId))
        .limit(1);

      if (!invitation) {
        return { success: false, message: 'Convite não encontrado' };
      }

      if (invitation.status !== 'pending') {
        return { success: false, message: 'Apenas convites pendentes podem ser revogados' };
      }

      await this.db
        .update(userInvitations)
        .set({
          status: 'revoked',
          revokedAt: new Date(),
          revokedBy,
          updatedAt: new Date(),
        })
        .where(eq(userInvitations.id, invitationId));

      console.log(`✅ Invitation revoked: ${invitationId}`);

      return {
        success: true,
        message: 'Convite revogado com sucesso',
      };

    } catch (error) {
      console.error('Error revoking invitation:', error);
      return {
        success: false,
        message: 'Erro ao revogar convite',
      };
    }
  }

  /**
   * Listar convites
   */
  async listInvitations(options: {
    status?: string;
    invitedBy?: string;
    page?: number;
    limit?: number;
    includeExpired?: boolean;
  } = {}): Promise<{
    invitations: InvitationWithDetails[];
    total: number;
    pagination: any;
  }> {
    try {
      const { 
        status, 
        invitedBy, 
        page = 1, 
        limit = 20, 
        includeExpired = true 
      } = options;

      const conditions = [];

      if (status) {
        conditions.push(eq(userInvitations.status, status));
      }

      if (invitedBy) {
        conditions.push(eq(userInvitations.invitedBy, invitedBy));
      }

      if (!includeExpired) {
        conditions.push(gte(userInvitations.expiresAt, new Date()));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const offset = (page - 1) * limit;

      // Query principal
      const results = await this.db
        .select()
        .from(userInvitations)
        .where(whereClause)
        .orderBy(desc(userInvitations.createdAt))
        .limit(limit)
        .offset(offset);

      // Contar total
      const [{ count: total }] = await this.db
        .select({ count: count() })
        .from(userInvitations)
        .where(whereClause);

      // Buscar detalhes de cada convite
      const invitationsWithDetails = await Promise.all(
        results.map(invitation => this.mapInvitationToDetails(invitation))
      );

      return {
        invitations: invitationsWithDetails,
        total: Number(total),
        pagination: {
          page,
          limit,
          total: Number(total),
          totalPages: Math.ceil(Number(total) / limit),
        },
      };

    } catch (error) {
      console.error('Error listing invitations:', error);
      return { 
        invitations: [], 
        total: 0, 
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } 
      };
    }
  }

  /**
   * Obter convite por token
   */
  async getInvitationByToken(token: string): Promise<InvitationWithDetails | null> {
    try {
      const [invitation] = await this.db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.inviteToken, token))
        .limit(1);

      if (!invitation) return null;

      return this.mapInvitationToDetails(invitation);

    } catch (error) {
      console.error('Error getting invitation by token:', error);
      return null;
    }
  }

  /**
   * Obter progresso do onboarding
   */
  async getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
    try {
      const [user] = await this.db
        .select({
          onboardingCompleted: users.onboardingCompleted,
          metadata: users.metadata,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      const metadata = user.metadata ? JSON.parse(user.metadata as string) : {};
      const completedSteps = metadata.completedOnboardingSteps || [];

      const allSteps = this.getOnboardingSteps();
      const completedCount = completedSteps.length;
      const totalSteps = allSteps.length;
      const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

      // Encontrar próximo step
      const nextStep = allSteps.find(step => !completedSteps.includes(step.id));

      return {
        userId,
        completedSteps,
        totalSteps,
        completedCount,
        progress,
        isCompleted: user.onboardingCompleted || completedCount === totalSteps,
        nextStep,
      };

    } catch (error) {
      console.error('Error getting onboarding progress:', error);
      return {
        userId,
        completedSteps: [],
        totalSteps: 0,
        completedCount: 0,
        progress: 0,
        isCompleted: false,
      };
    }
  }

  /**
   * Marcar step do onboarding como completo
   */
  async completeOnboardingStep(
    userId: string,
    stepId: string
  ): Promise<{ success: boolean; message: string; progress?: OnboardingProgress }> {
    try {
      console.log(`✅ Completing onboarding step: ${stepId} for user: ${userId}`);

      // Buscar usuário atual
      const [user] = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return { success: false, message: 'Usuário não encontrado' };
      }

      const metadata = user.metadata ? JSON.parse(user.metadata as string) : {};
      const completedSteps = metadata.completedOnboardingSteps || [];

      // Verificar se step já foi completado
      if (completedSteps.includes(stepId)) {
        return { success: false, message: 'Step já foi completado' };
      }

      // Verificar se step é válido
      const validSteps = this.getOnboardingSteps().map(s => s.id);
      if (!validSteps.includes(stepId)) {
        return { success: false, message: 'Step inválido' };
      }

      // Adicionar step aos completados
      completedSteps.push(stepId);
      metadata.completedOnboardingSteps = completedSteps;

      // Verificar se onboarding foi finalizado
      const allSteps = this.getOnboardingSteps();
      const isCompleted = completedSteps.length === allSteps.length;

      const updateData: any = {
        metadata: JSON.stringify(metadata),
        updatedAt: new Date(),
      };

      if (isCompleted) {
        updateData.onboardingCompleted = true;
        updateData.onboardingCompletedAt = new Date();
      }

      await this.db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId));

      const progress = await this.getOnboardingProgress(userId);

      console.log(`✅ Onboarding step completed: ${stepId}`);

      return {
        success: true,
        message: isCompleted ? 'Onboarding concluído!' : 'Step completado com sucesso',
        progress,
      };

    } catch (error) {
      console.error('Error completing onboarding step:', error);
      return {
        success: false,
        message: 'Erro ao completar step do onboarding',
      };
    }
  }

  /**
   * Marcar onboarding como completo
   */
  async completeOnboarding(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      console.log(`🎉 Completing onboarding for user: ${userId}`);

      await this.db
        .update(users)
        .set({
          onboardingCompleted: true,
          onboardingCompletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✅ Onboarding completed: ${userId}`);

      return {
        success: true,
        message: 'Onboarding concluído com sucesso!',
      };

    } catch (error) {
      console.error('Error completing onboarding:', error);
      return {
        success: false,
        message: 'Erro ao concluir onboarding',
      };
    }
  }

  /**
   * Limpar convites expirados
   */
  async cleanupExpiredInvitations(): Promise<{ cleaned: number; errors: string[] }> {
    try {
      console.log('🧹 Cleaning up expired invitations');

      const now = new Date();
      const expired = await this.db
        .update(userInvitations)
        .set({
          status: 'expired',
          updatedAt: now,
        })
        .where(
          and(
            eq(userInvitations.status, 'pending'),
            lte(userInvitations.expiresAt, now)
          )
        )
        .returning();

      console.log(`✅ Cleaned up ${expired.length} expired invitations`);

      return {
        cleaned: expired.length,
        errors: [],
      };

    } catch (error) {
      console.error('Error cleaning up expired invitations:', error);
      return {
        cleaned: 0,
        errors: ['Erro na limpeza de convites expirados'],
      };
    }
  }

  /**
   * Obter detalhes do convite com informações do convidador
   */
  private async getInvitationWithDetails(invitationId: string): Promise<InvitationWithDetails | null> {
    try {
      const [invitation] = await this.db
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.id, invitationId))
        .limit(1);

      if (!invitation) return null;

      return this.mapInvitationToDetails(invitation);

    } catch (error) {
      console.error('Error getting invitation details:', error);
      return null;
    }
  }

  /**
   * Mapear convite para detalhes
   */
  private async mapInvitationToDetails(invitation: any): Promise<InvitationWithDetails> {
    // Buscar dados do convidador
    let inviterName: string | undefined;
    let inviterEmail: string | undefined;

    try {
      const [inviter] = await this.db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, invitation.invitedBy))
        .limit(1);

      if (inviter) {
        inviterName = inviter.name || inviter.email;
        inviterEmail = inviter.email;
      }
    } catch (error) {
      console.error('Error fetching inviter details:', error);
    }

    const now = new Date();
    const isExpired = invitation.expiresAt < now;

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      permissions: invitation.permissions ? JSON.parse(invitation.permissions) : [],
      message: invitation.message,
      status: invitation.status,
      brandId: invitation.brandId,
      brandName: invitation.brandName,
      invitedBy: invitation.invitedBy,
      invitedByName: inviterName,
      invitedByEmail: inviterEmail,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
      isPending: invitation.status === 'pending' && !isExpired,
      isExpired,
      isAccepted: invitation.status === 'accepted',
      isRevoked: invitation.status === 'revoked',
    };
  }

  /**
   * Obter steps do onboarding
   */
  private getOnboardingSteps(): OnboardingStep[] {
    return [
      {
        id: 'profile_setup',
        name: 'profile_setup',
        title: 'Complete seu perfil',
        description: 'Adicione suas informações pessoais e foto de perfil',
        completed: false,
        required: true,
        order: 1,
      },
      {
        id: 'security_setup',
        name: 'security_setup', 
        title: 'Configure a segurança',
        description: 'Defina uma senha forte e considere ativar a autenticação de dois fatores',
        completed: false,
        required: true,
        order: 2,
      },
      {
        id: 'role_permissions',
        name: 'role_permissions',
        title: 'Entenda suas permissões',
        description: 'Conheça suas responsabilidades e o que você pode fazer no sistema',
        completed: false,
        required: true,
        order: 3,
      },
      {
        id: 'dashboard_tour',
        name: 'dashboard_tour',
        title: 'Tour pelo dashboard',
        description: 'Explore as principais funcionalidades do sistema',
        completed: false,
        required: false,
        order: 4,
      },
      {
        id: 'first_article',
        name: 'first_article',
        title: 'Crie seu primeiro artigo',
        description: 'Familiarize-se com o editor e fluxo de publicação',
        completed: false,
        required: false,
        order: 5,
      },
    ];
  }
}