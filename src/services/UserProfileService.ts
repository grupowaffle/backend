import { DatabaseType } from '../repositories/BaseRepository';
import { ProfileRepository } from '../repositories/ProfileRepository';

export interface D1User {
  id: string;
  email: string;
  name: string;
  role: string;
  brand_name: string;
  brandId: number;
  permissions: string[];
  roles: string[];
}

export interface UserProfile {
  user: D1User;
  profile: {
    id: string;
    name: string;
    description: string;
    role: string;
    permissions: string[];
    isActive: boolean;
    isDefault: boolean;
  } | null;
}

export class UserProfileService {
  private profileRepository: ProfileRepository;

  constructor(db: DatabaseType) {
    this.profileRepository = new ProfileRepository(db);
  }

  /**
   * Obtém o perfil correspondente ao role do usuário
   */
  async getUserProfile(user: D1User): Promise<UserProfile> {
    try {
      // Buscar perfil baseado no role principal do usuário
      const primaryRole = user.roles?.[0] || user.role;
      const profile = await this.profileRepository.getByRole(primaryRole);

      return {
        user,
        profile: profile ? {
          id: profile.id,
          name: profile.name,
          description: profile.description || '',
          role: profile.role,
          permissions: profile.permissions,
          isActive: profile.isActive,
          isDefault: profile.isDefault
        } : null
      };
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao obter perfil do usuário:', error);
      return {
        user,
        profile: null
      };
    }
  }

  /**
   * Verifica se o usuário tem uma permissão específica
   */
  async hasPermission(user: D1User, permission: string): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return false;
      }

      // Super admin tem todas as permissões
      if (userProfile.profile.role === 'super_admin') {
        return true;
      }

      // Verificar se a permissão está na lista do perfil
      return userProfile.profile.permissions.includes(permission);
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao verificar permissão:', error);
      return false;
    }
  }

  /**
   * Verifica se o usuário tem qualquer uma das permissões fornecidas
   */
  async hasAnyPermission(user: D1User, permissions: string[]): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return false;
      }

      // Super admin tem todas as permissões
      if (userProfile.profile.role === 'super_admin') {
        return true;
      }

      // Verificar se alguma permissão está na lista do perfil
      return permissions.some(permission => 
        userProfile.profile!.permissions.includes(permission)
      );
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao verificar permissões:', error);
      return false;
    }
  }

  /**
   * Verifica se o usuário tem todas as permissões fornecidas
   */
  async hasAllPermissions(user: D1User, permissions: string[]): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return false;
      }

      // Super admin tem todas as permissões
      if (userProfile.profile.role === 'super_admin') {
        return true;
      }

      // Verificar se todas as permissões estão na lista do perfil
      return permissions.every(permission => 
        userProfile.profile!.permissions.includes(permission)
      );
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao verificar permissões:', error);
      return false;
    }
  }

  /**
   * Verifica se o usuário tem um role específico
   */
  async hasRole(user: D1User, role: string): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return false;
      }

      return userProfile.profile.role === role;
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao verificar role:', error);
      return false;
    }
  }

  /**
   * Verifica se o usuário tem qualquer um dos roles fornecidos
   */
  async hasAnyRole(user: D1User, roles: string[]): Promise<boolean> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return false;
      }

      return roles.includes(userProfile.profile.role);
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao verificar roles:', error);
      return false;
    }
  }

  /**
   * Obtém todas as permissões do usuário
   */
  async getUserPermissions(user: D1User): Promise<string[]> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return [];
      }

      return userProfile.profile.permissions;
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao obter permissões:', error);
      return [];
    }
  }

  /**
   * Obtém o nível de acesso do usuário
   */
  async getAccessLevel(user: D1User): Promise<'super_admin' | 'admin' | 'editor' | 'redator' | 'analista' | 'tecnico' | 'visualizador' | 'none'> {
    try {
      const userProfile = await this.getUserProfile(user);
      
      if (!userProfile.profile) {
        return 'none';
      }

      return userProfile.profile.role as any;
    } catch (error) {
      console.error('❌ [USER PROFILE SERVICE] Erro ao obter nível de acesso:', error);
      return 'none';
    }
  }
}
