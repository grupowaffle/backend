import { CloudflareD1Client } from '../config/types/auth';

export interface D1Role {
  id: number;
  name: string;
  description: string;
  level: number;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface D1UserWithRole {
  id: string;
  email: string;
  name: string;
  role: string;
  brand_name: string;
  brandId: number;
  permissions: string[];
  roles: string[];
  allRoles: string[];
  isActive: boolean;
  profileName?: string;
  createdAt?: string;
  updatedAt?: string;
  roleData?: D1Role;
}

export class D1RoleService {
  constructor(private d1Client: CloudflareD1Client) {}

  /**
   * Busca todos os roles ativos do D1
   */
  async getAllRoles(): Promise<D1Role[]> {
    try {
      const result = await this.d1Client.execute(
        'SELECT * FROM roles WHERE is_active = 1 ORDER BY level DESC'
      );

      if (!result.success || !result.result?.results) {
        return [];
      }

      return result.result.results.map((row: any) => {
        let permissions: string[] = [];
        
        try {
          const parsed = JSON.parse(row.permissions || '[]');
          
          // Se é um objeto com chaves de aplicação (novo formato)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            // Achatar todas as permissões em um único array
            for (const appPerms of Object.values(parsed)) {
              if (Array.isArray(appPerms)) {
                permissions.push(...appPerms);
              }
            }
          } else if (Array.isArray(parsed)) {
            // Formato antigo: já é um array
            permissions = parsed;
          }
        } catch (error) {
          console.error('❌ [D1 ROLE SERVICE] Erro ao fazer parse das permissões do role:', row.name, error);
          permissions = [];
        }
        
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          level: row.level,
          permissions: permissions,
          is_active: Boolean(row.is_active),
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      });
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao buscar roles:', error);
      return [];
    }
  }

  /**
   * Busca um role específico por nome
   */
  async getRoleByName(roleName: string): Promise<D1Role | null> {
    try {
      const result = await this.d1Client.execute(
        'SELECT * FROM roles WHERE name = ? AND is_active = 1 LIMIT 1',
        [roleName]
      );

      if (!result.success || !result.result?.results || result.result.results.length === 0) {
        return null;
      }

      const row = result.result.results[0];
      
      let permissions: string[] = [];
      try {
        const parsed = JSON.parse(row.permissions || '[]');
        
        // Se é um objeto com chaves de aplicação (novo formato)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          // Achatar todas as permissões em um único array
          for (const appPerms of Object.values(parsed)) {
            if (Array.isArray(appPerms)) {
              permissions.push(...appPerms);
            }
          }
        } else if (Array.isArray(parsed)) {
          // Formato antigo: já é um array
          permissions = parsed;
        }
      } catch (error) {
        console.error('❌ [D1 ROLE SERVICE] Erro ao fazer parse das permissões do role:', row.name, error);
        permissions = [];
      }
      
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        level: row.level,
        permissions: permissions,
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao buscar role:', error);
      return null;
    }
  }

  /**
   * Busca usuário com dados do role
   */
  async getUserWithRole(userId: string): Promise<D1UserWithRole | null> {
    try {
      // Primeiro, buscar dados básicos do usuário
      const userResult = await this.d1Client.execute(
        'SELECT id, email, display_name as name FROM users WHERE id = ? AND is_active = 1 LIMIT 1',
        [userId]
      );

      if (!userResult.success || !userResult.result?.results || userResult.result.results.length === 0) {
        return null;
      }

      const user = userResult.result.results[0];

      // Depois, buscar todos os roles ativos do usuário
      const roleResult = await this.d1Client.execute(`
        SELECT 
          r.id as role_id, r.name as role_name, r.description, r.level, r.permissions, r.is_active,
          r.created_at, r.updated_at,
          ur.assigned_at, ur.expires_at, ur.is_active as user_role_active
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
        ORDER BY ur.assigned_at DESC
      `, [userId]);

      let roleData: any = undefined;
      let permissions: string[] = [];
      let roleName = 'user';
      let allRoles: string[] = [];
      let cmsRole: string = 'user';
      let applicationPermissions: { [key: string]: string[] } = {};

      if (roleResult.success && roleResult.result?.results && roleResult.result.results.length > 0) {
        // Processar todos os roles do usuário
        for (const role of roleResult.result.results) {
          console.log('🔧 [D1 ROLE SERVICE] Processando role:', {
            role_name: role.role_name,
            permissions_raw: role.permissions
          });
          
          try {
            // Tentar fazer parse do JSON
            if (role.permissions && typeof role.permissions === 'string') {
              const parsed = JSON.parse(role.permissions);
              
              // Verificar se o parsed é um objeto com chaves de aplicação (novo formato)
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                console.log('🔧 [D1 ROLE SERVICE] Permissões em formato de objeto por aplicação:', parsed);
                // Combinar permissões de todas as aplicações no objeto
                for (const [app, perms] of Object.entries(parsed)) {
                  if (Array.isArray(perms)) {
                    if (!applicationPermissions[app]) {
                      applicationPermissions[app] = [];
                    }
                    applicationPermissions[app].push(...perms);
                  }
                }
              } else if (Array.isArray(parsed)) {
                // Formato antigo: array simples
                console.log('🔧 [D1 ROLE SERVICE] Permissões em formato de array:', parsed);
                // Determinar aplicação baseada no nome do role
                let application = 'cms'; // Padrão
                
                if (role.role_name.includes('admin') || role.role_name.includes('super_admin')) {
                  application = 'admin';
                } else if (role.role_name.includes('cms') || role.role_name.includes('editor') || role.role_name.includes('redator')) {
                  application = 'cms';
                }
                
                if (!applicationPermissions[application]) {
                  applicationPermissions[application] = [];
                }
                applicationPermissions[application].push(...parsed);
              }
            } else if (Array.isArray(role.permissions)) {
              // Permissões já são array
              console.log('🔧 [D1 ROLE SERVICE] Permissões já são array:', role.permissions);
              let application = 'cms'; // Padrão
              
              if (role.role_name.includes('admin') || role.role_name.includes('super_admin')) {
                application = 'admin';
              } else if (role.role_name.includes('cms') || role.role_name.includes('editor') || role.role_name.includes('redator')) {
                application = 'cms';
              }
              
              if (!applicationPermissions[application]) {
                applicationPermissions[application] = [];
              }
              applicationPermissions[application].push(...role.permissions);
            }
          } catch (error) {
            console.error('❌ [D1 ROLE SERVICE] Erro ao fazer parse das permissões:', error);
            console.error('❌ [D1 ROLE SERVICE] Dados do role:', role);
          }
          
          allRoles.push(role.role_name);
          
          // Usar o primeiro role como role principal (por enquanto)
          if (!roleData) {
            cmsRole = role.role_name;
            roleName = role.role_name;
            
            roleData = {
              id: role.role_id,
              name: role.role_name,
              description: role.description,
              level: role.level,
              permissions: rolePermissions,
              is_active: Boolean(role.is_active),
              created_at: role.created_at,
              updated_at: role.updated_at
            };
          }
        }
        
        // Remover permissões duplicadas
        permissions = [...new Set(permissions)];
        
        console.log('🔧 [D1 ROLE SERVICE] Permissões finais combinadas:', permissions);
        console.log('🔧 [D1 ROLE SERVICE] Permissões por aplicação:', applicationPermissions);
        console.log('🔧 [D1 ROLE SERVICE] Roles finais:', allRoles);
        console.log('🔧 [D1 ROLE SERVICE] Role principal CMS:', cmsRole);
      }

      console.log('🔧 [D1 ROLE SERVICE] Retornando usuário com permissões:', {
        id: user.id,
        email: user.email,
        name: user.name,
        role: cmsRole,
        permissions: permissions,
        roles: allRoles
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: cmsRole, // Role principal do CMS
        brand_name: 'Default Brand', // Valor padrão
        brandId: 0, // Valor padrão
        permissions: permissions, // Todas as permissões combinadas
        roles: allRoles, // Todos os roles do usuário
        isActive: true, // Usuários ativos
        profileName: cmsRole ? cmsRole.replace('_', ' ').toUpperCase() : 'Usuário',
        roleData: roleData, // Dados do role principal do CMS
        allRoles: allRoles, // Lista de todos os roles
        cmsRole: cmsRole, // Role específico do CMS
        applicationPermissions: applicationPermissions // Permissões organizadas por aplicação
      };
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao buscar usuário com role:', error);
      return null;
    }
  }

  /**
   * Verifica se usuário tem permissão específica
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const userWithRole = await this.getUserWithRole(userId);
      
      if (!userWithRole || !userWithRole.roleData) {
        return false;
      }

      const permissions = userWithRole.roleData.permissions;
      
      // Permissão global
      if (permissions.includes('*')) {
        return true;
      }

      // Permissão específica
      if (permissions.includes(permission)) {
        return true;
      }

      // Verificação de curingas (ex: 'users.*' cobre 'users.read')
      const wildcardMatch = permissions.some(perm => {
        if (perm.endsWith('.*')) {
          const basePermission = perm.slice(0, -2);
          return permission.startsWith(basePermission + '.');
        }
        return false;
      });

      return wildcardMatch;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao verificar permissão:', error);
      return false;
    }
  }

  /**
   * Busca permissões do usuário
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const userWithRole = await this.getUserWithRole(userId);
      
      if (!userWithRole || !userWithRole.roleData) {
        return [];
      }

      return userWithRole.roleData.permissions;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao buscar permissões:', error);
      return [];
    }
  }

  /**
   * Verifica se usuário tem role específico
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const userWithRole = await this.getUserWithRole(userId);
      
      if (!userWithRole || !userWithRole.roleData) {
        return false;
      }

      return userWithRole.roleData.name === roleName;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao verificar role:', error);
      return false;
    }
  }

  /**
   * Atualiza dados básicos do usuário (nome, email, status)
   */
  async updateUser(userId: string, userData: { name?: string; email?: string; isActive?: boolean }): Promise<boolean> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (userData.name !== undefined) {
        updates.push('display_name = ?');
        values.push(userData.name);
      }

      if (userData.email !== undefined) {
        updates.push('email = ?');
        values.push(userData.email);
      }

      if (userData.isActive !== undefined) {
        updates.push('is_active = ?');
        values.push(userData.isActive ? 1 : 0);
      }

      if (updates.length === 0) {
        return true; // Nenhuma atualização necessária
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(userId);

      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      
      const result = await this.d1Client.execute(query, values);
      
      if (!result.success) {
        console.error('❌ [D1 ROLE SERVICE] Erro ao atualizar usuário:', result.errors);
        return false;
      }

      console.log('✅ [D1 ROLE SERVICE] Usuário atualizado com sucesso:', userId);
      return true;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao atualizar usuário:', error);
      return false;
    }
  }

  /**
   * Atualiza usuário completo (dados + role)
   */
  async updateUserWithRole(userId: string, userData: { 
    name?: string; 
    email?: string; 
    isActive?: boolean; 
    role?: string; 
    assignedBy?: string 
  }): Promise<boolean> {
    try {
      console.log('🔧 [D1 ROLE SERVICE] Atualizando usuário:', userId, userData);
      
      // Atualizar dados básicos do usuário
      const userUpdateSuccess = await this.updateUser(userId, {
        name: userData.name,
        email: userData.email,
        isActive: userData.isActive
      });

      console.log('🔧 [D1 ROLE SERVICE] Resultado atualização dados:', userUpdateSuccess);

      if (!userUpdateSuccess) {
        console.error('❌ [D1 ROLE SERVICE] Falha ao atualizar dados básicos do usuário');
        return false;
      }

      // Se role foi fornecido, adicionar role (sem remover existentes)
      if (userData.role) {
        console.log('🔧 [D1 ROLE SERVICE] Adicionando role CMS:', userData.role);
        const roleAddSuccess = await this.addUserRole(userId, userData.role, userData.assignedBy, 'cms');
        console.log('🔧 [D1 ROLE SERVICE] Resultado adição role:', roleAddSuccess);
        
        if (!roleAddSuccess) {
          console.error('❌ [D1 ROLE SERVICE] Erro ao adicionar role do usuário');
          return false;
        }
      }

      console.log('✅ [D1 ROLE SERVICE] Usuário atualizado com sucesso');
      return true;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao atualizar usuário com role:', error);
      return false;
    }
  }

  /**
   * Verifica e adiciona campo application se necessário
   */
  async ensureApplicationField(): Promise<boolean> {
    try {
      // Tentar adicionar o campo application se não existir
      await this.d1Client.execute(`
        ALTER TABLE user_roles ADD COLUMN application TEXT DEFAULT 'cms'
      `);
      console.log('✅ [D1 ROLE SERVICE] Campo application adicionado à tabela user_roles');
      return true;
    } catch (error) {
      // Se o campo já existe, não é um erro
      if (error.message && error.message.includes('duplicate column name')) {
        console.log('✅ [D1 ROLE SERVICE] Campo application já existe na tabela user_roles');
        return true;
      }
      console.error('❌ [D1 ROLE SERVICE] Erro ao adicionar campo application:', error);
      return false;
    }
  }

  /**
   * Adiciona role a um usuário (sem remover roles existentes)
   */
  async addUserRole(userId: string, newRole: string, assignedBy?: string, application?: string): Promise<boolean> {
    try {
      console.log('🔧 [D1 ROLE SERVICE] Adicionando role:', newRole, 'para usuário:', userId);
      
      // Garantir que o campo application existe
      await this.ensureApplicationField();
      
      // Primeiro, buscar o ID do role pelo nome
      const roleResult = await this.d1Client.execute(
        'SELECT id FROM roles WHERE name = ? AND is_active = 1 LIMIT 1',
        [newRole]
      );

      if (!roleResult.success || !roleResult.result?.results || roleResult.result.results.length === 0) {
        console.error('❌ [D1 ROLE SERVICE] Role não encontrado:', newRole);
        return false;
      }

      const roleId = roleResult.result.results[0].id;

      // Verificar se o usuário já tem este role ativo
      const existingRoleResult = await this.d1Client.execute(
        'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? AND is_active = 1 LIMIT 1',
        [userId, roleId]
      );

      // Se já tem o mesmo role ativo, não precisa fazer nada
      if (existingRoleResult.success && existingRoleResult.result?.results && existingRoleResult.result.results.length > 0) {
        console.log('✅ [D1 ROLE SERVICE] Usuário já possui este role ativo:', newRole);
        return true;
      }

      // Inserir novo role para o usuário (sem desativar outros)
      const insertResult = await this.d1Client.execute(
        'INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active, application) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1, ?)',
        [userId, roleId, assignedBy || userId, application || 'cms']
      );

      if (!insertResult.success) {
        console.error('❌ [D1 ROLE SERVICE] Erro ao inserir novo role');
        return false;
      }

      console.log('✅ [D1 ROLE SERVICE] Role adicionado com sucesso:', newRole);
      return true;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao adicionar role:', error);
      return false;
    }
  }

  /**
   * Remove role específico de um usuário (por aplicação)
   */
  async removeUserRole(userId: string, roleToRemove: string, application?: string): Promise<boolean> {
    try {
      console.log('🔧 [D1 ROLE SERVICE] Removendo role:', roleToRemove, 'do usuário:', userId);
      
      // Buscar o ID do role
      const roleResult = await this.d1Client.execute(
        'SELECT id FROM roles WHERE name = ? AND is_active = 1 LIMIT 1',
        [roleToRemove]
      );

      if (!roleResult.success || !roleResult.result?.results || roleResult.result.results.length === 0) {
        console.error('❌ [D1 ROLE SERVICE] Role não encontrado:', roleToRemove);
        return false;
      }

      const roleId = roleResult.result.results[0].id;

      // Desativar role específico do usuário (por aplicação)
      const deactivateResult = await this.d1Client.execute(
        'UPDATE user_roles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND role_id = ? AND application = ?',
        [userId, roleId, application || 'cms']
      );

      if (!deactivateResult.success) {
        console.error('❌ [D1 ROLE SERVICE] Erro ao desativar role');
        return false;
      }

      console.log('✅ [D1 ROLE SERVICE] Role removido com sucesso:', roleToRemove);
      return true;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao remover role:', error);
      return false;
    }
  }

  /**
   * Atualiza role de um usuário (MÉTODO ANTIGO - MANTIDO PARA COMPATIBILIDADE)
   */
  async updateUserRole(userId: string, newRole: string, assignedBy?: string): Promise<boolean> {
    try {
      // Primeiro, buscar o ID do role pelo nome
      const roleResult = await this.d1Client.execute(
        'SELECT id FROM roles WHERE name = ? AND is_active = 1 LIMIT 1',
        [newRole]
      );

      if (!roleResult.success || !roleResult.result?.results || roleResult.result.results.length === 0) {
        console.error('❌ [D1 ROLE SERVICE] Role não encontrado:', newRole);
        return false;
      }

      const roleId = roleResult.result.results[0].id;

      // Verificar se o usuário já tem este role ativo
      const existingRoleResult = await this.d1Client.execute(
        'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ? AND is_active = 1 LIMIT 1',
        [userId, roleId]
      );

      // Se já tem o mesmo role ativo, não precisa fazer nada
      if (existingRoleResult.success && existingRoleResult.result?.results && existingRoleResult.result.results.length > 0) {
        console.log('✅ [D1 ROLE SERVICE] Usuário já possui este role ativo:', newRole);
        return true;
      }

      // Desativar todos os roles atuais do usuário
      const deactivateResult = await this.d1Client.execute(
        'UPDATE user_roles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_active = 1',
        [userId]
      );

      if (!deactivateResult.success) {
        console.error('❌ [D1 ROLE SERVICE] Erro ao desativar roles atuais');
        return false;
      }

      // Inserir novo role para o usuário
      const insertResult = await this.d1Client.execute(
        'INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at, is_active) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 1)',
        [userId, roleId, assignedBy || userId]
      );

      if (!insertResult.success) {
        console.error('❌ [D1 ROLE SERVICE] Erro ao inserir novo role');
        return false;
      }

      console.log('✅ [D1 ROLE SERVICE] Role atualizado com sucesso:', newRole);
      return true;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao atualizar role:', error);
      return false;
    }
  }

  /**
   * Cria novo role
   */
  async createRole(roleData: {
    name: string;
    description: string;
    level: number;
    permissions: string[];
  }): Promise<boolean> {
    try {
      const result = await this.d1Client.execute(
        'INSERT INTO roles (name, description, level, permissions, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [roleData.name, roleData.description, roleData.level, JSON.stringify(roleData.permissions)]
      );

      return result.success;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao criar role:', error);
      return false;
    }
  }

  /**
   * Atualiza role existente
   */
  async updateRole(roleId: number, roleData: {
    name?: string;
    description?: string;
    level?: number;
    permissions?: string[];
    is_active?: boolean;
  }): Promise<boolean> {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (roleData.name !== undefined) {
        updates.push('name = ?');
        values.push(roleData.name);
      }
      if (roleData.description !== undefined) {
        updates.push('description = ?');
        values.push(roleData.description);
      }
      if (roleData.level !== undefined) {
        updates.push('level = ?');
        values.push(roleData.level);
      }
      if (roleData.permissions !== undefined) {
        updates.push('permissions = ?');
        values.push(JSON.stringify(roleData.permissions));
      }
      if (roleData.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(roleData.is_active ? 1 : 0);
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(roleId);

      const result = await this.d1Client.execute(
        `UPDATE roles SET ${updates.join(', ')} WHERE id = ?`,
        values
      );

      return result.success;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao atualizar role:', error);
      return false;
    }
  }

  /**
   * Desativa role (soft delete)
   */
  async deactivateRole(roleId: number): Promise<boolean> {
    try {
      const result = await this.d1Client.execute(
        'UPDATE roles SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [roleId]
      );

      return result.success;
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao desativar role:', error);
      return false;
    }
  }

  /**
   * Busca todos os roles de um usuário
   */
  async getUserRoles(userId: string): Promise<D1Role[]> {
    try {
      const result = await this.d1Client.execute(`
        SELECT 
          r.id, r.name, r.description, r.level, r.permissions, r.is_active,
          r.created_at, r.updated_at,
          ur.assigned_at, ur.expires_at, ur.is_active as user_role_active
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = ? AND ur.is_active = 1 AND r.is_active = 1
        ORDER BY ur.assigned_at DESC
      `, [userId]);

      if (!result.success || !result.result?.results) {
        return [];
      }

      return result.result.results.map((row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        level: row.level,
        permissions: JSON.parse(row.permissions || '[]'),
        is_active: Boolean(row.is_active),
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao buscar roles do usuário:', error);
      return [];
    }
  }



  /**
   * Busca todos os usuários com seus roles
   */
  async getAllUsersWithRoles(): Promise<D1UserWithRole[]> {
    try {
      const result = await this.d1Client.execute(`
        SELECT 
          u.id, u.email, u.display_name as name, u.is_active,
          r.id as role_id, r.name as role_name, r.description, r.level, r.permissions, r.is_active as role_active,
          ur.assigned_at, ur.expires_at, ur.is_active as user_role_active
        FROM users u 
        LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = 1
        LEFT JOIN roles r ON ur.role_id = r.id AND r.is_active = 1
        WHERE u.is_active = 1
        ORDER BY u.display_name ASC
      `);

      if (!result.success || !result.result?.results) {
        return [];
      }

      const users: D1UserWithRole[] = [];
      const userMap = new Map<string, D1UserWithRole>();

      for (const row of result.result.results) {
        const userId = row.id;
        
        // Filtrar apenas usuários ativos
        if (row.is_active === 1 && !userMap.has(userId)) {
          const permissions = JSON.parse(row.permissions || '[]');
          
          userMap.set(userId, {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role_name || 'user',
            brand_name: 'Default Brand',
            brandId: 0,
            permissions: permissions,
            roles: [row.role_name || 'user'],
            isActive: Boolean(row.is_active),
            profileName: row.role_name ? row.role_name.replace('_', ' ').toUpperCase() : 'Usuário',
            createdAt: row.assigned_at || new Date().toISOString(),
            updatedAt: row.assigned_at || new Date().toISOString(),
            roleData: row.role_id ? {
              id: row.role_id,
              name: row.role_name,
              description: row.description,
              level: row.level,
              permissions: permissions,
              is_active: Boolean(row.role_active),
              created_at: row.assigned_at,
              updated_at: row.assigned_at
            } : undefined
          });
        }
      }

      return Array.from(userMap.values());
    } catch (error) {
      console.error('❌ [D1 ROLE SERVICE] Erro ao buscar usuários:', error);
      return [];
    }
  }
}
