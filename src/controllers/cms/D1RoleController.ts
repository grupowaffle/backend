import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Env } from '../../config/types/common';
import { CloudflareD1Client } from '../../config/types/auth';
import { D1RoleService } from '../../services/D1RoleService';

// Schema de validação para criar role
const createRoleSchema = z.object({
  name: z.string().min(1, 'Nome do role é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  level: z.number().min(1, 'Nível deve ser maior que 0'),
  permissions: z.array(z.string()).default([]),
});

// Schema de validação para atualizar role
const updateRoleSchema = z.object({
  name: z.string().min(1, 'Nome do role é obrigatório').optional(),
  description: z.string().min(1, 'Descrição é obrigatória').optional(),
  level: z.number().min(1, 'Nível deve ser maior que 0').optional(),
  permissions: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

// Schema de validação para atualizar role de usuário
const updateUserRoleSchema = z.object({
  userId: z.string().min(1, 'ID do usuário é obrigatório'),
  role: z.string().min(1, 'Role é obrigatório'),
});

export class D1RoleController {
  private app: Hono;
  private env: Env;
  private roleService: D1RoleService;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    // Inicializar D1RoleService
    const d1Client = new CloudflareD1Client({
      accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
      databaseId: env.CLOUDFLARE_D1_DATABASE_ID || '',
      apiToken: env.CLOUDFLARE_API_TOKEN || '',
    });
    this.roleService = new D1RoleService(d1Client);
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // Buscar todos os usuários com seus roles
    this.app.get('/users', async (c) => {
      try {
        const users = await this.roleService.getAllUsersWithRoles();
        return c.json({
          success: true,
          data: users
        });
      } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar usuários'
        }, 500);
      }
    });

    // Listar todos os roles
    this.app.get('/', async (c) => {
      try {
        const roles = await this.roleService.getAllRoles();
        return c.json({
          success: true,
          data: roles
        });
      } catch (error) {
        console.error('Erro ao buscar roles:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar roles'
        }, 500);
      }
    });

    // Buscar role por nome
    this.app.get('/:name', async (c) => {
      try {
        const name = c.req.param('name');
        const role = await this.roleService.getRoleByName(name);
        
        if (!role) {
          return c.json({
            success: false,
            error: 'Role não encontrado'
          }, 404);
        }
        
        return c.json({
          success: true,
          data: role
        });
      } catch (error) {
        console.error('Erro ao buscar role:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar role'
        }, 500);
      }
    });

    // Criar novo role
    this.app.post('/', zValidator('json', createRoleSchema), async (c) => {
      try {
        const data = c.req.valid('json');
        const success = await this.roleService.createRole(data);
        
        if (success) {
          return c.json({
            success: true,
            message: 'Role criado com sucesso'
          }, 201);
        } else {
          return c.json({
            success: false,
            error: 'Erro ao criar role'
          }, 500);
        }
      } catch (error) {
        console.error('Erro ao criar role:', error);
        return c.json({
          success: false,
          error: `Erro ao criar role: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Atualizar role
    this.app.put('/:id', zValidator('json', updateRoleSchema), async (c) => {
      try {
        const id = parseInt(c.req.param('id'));
        const data = c.req.valid('json');
        const success = await this.roleService.updateRole(id, data);
        
        if (success) {
          return c.json({
            success: true,
            message: 'Role atualizado com sucesso'
          });
        } else {
          return c.json({
            success: false,
            error: 'Erro ao atualizar role'
          }, 500);
        }
      } catch (error) {
        console.error('Erro ao atualizar role:', error);
        return c.json({
          success: false,
          error: `Erro ao atualizar role: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Desativar role (soft delete)
    this.app.delete('/:id', async (c) => {
      try {
        const id = parseInt(c.req.param('id'));
        const success = await this.roleService.deactivateRole(id);
        
        if (success) {
          return c.json({
            success: true,
            message: 'Role desativado com sucesso'
          });
        } else {
          return c.json({
            success: false,
            error: 'Erro ao desativar role'
          }, 500);
        }
      } catch (error) {
        console.error('Erro ao desativar role:', error);
        return c.json({
          success: false,
          error: `Erro ao desativar role: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Atualizar usuário completo (dados + role)
    this.app.put('/user/:userId', zValidator('json', z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      isActive: z.boolean().optional(),
      role: z.string().optional(),
      assignedBy: z.string().optional()
    })), async (c) => {
      try {
        const userId = c.req.param('userId');
        const userData = c.req.valid('json');
        
        const success = await this.roleService.updateUserWithRole(userId, userData);
        if (!success) {
          return c.json({
            success: false,
            error: 'Erro ao atualizar usuário'
          }, 500);
        }
        
        return c.json({
          success: true,
          message: 'Usuário atualizado com sucesso'
        });
      } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        return c.json({
          success: false,
          error: `Erro ao atualizar usuário: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Atualizar role de usuário
    this.app.put('/user/role', zValidator('json', updateUserRoleSchema), async (c) => {
      try {
        const { userId, role } = c.req.valid('json');
        const success = await this.roleService.updateUserRole(userId, role);
        
        if (success) {
          return c.json({
            success: true,
            message: 'Role do usuário atualizado com sucesso'
          });
        } else {
          return c.json({
            success: false,
            error: 'Erro ao atualizar role do usuário'
          }, 500);
        }
      } catch (error) {
        console.error('Erro ao atualizar role do usuário:', error);
        return c.json({
          success: false,
          error: `Erro ao atualizar role do usuário: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar usuário com role
    this.app.get('/user/:userId', async (c) => {
      try {
        const userId = c.req.param('userId');
        const userWithRole = await this.roleService.getUserWithRole(userId);
        
        if (!userWithRole) {
          return c.json({
            success: false,
            error: 'Usuário não encontrado'
          }, 404);
        }
        
        return c.json({
          success: true,
          data: userWithRole
        });
      } catch (error) {
        console.error('Erro ao buscar usuário com role:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar usuário com role'
        }, 500);
      }
    });

    // Verificar permissão do usuário
    this.app.get('/user/:userId/permission/:permission', async (c) => {
      try {
        const userId = c.req.param('userId');
        const permission = c.req.param('permission');
        const hasPermission = await this.roleService.hasPermission(userId, permission);
        
        return c.json({
          success: true,
          data: {
            userId,
            permission,
            hasPermission
          }
        });
      } catch (error) {
        console.error('Erro ao verificar permissão:', error);
        return c.json({
          success: false,
          error: 'Erro ao verificar permissão'
        }, 500);
      }
    });

    // Buscar permissões do usuário
    this.app.get('/user/:userId/permissions', async (c) => {
      try {
        const userId = c.req.param('userId');
        const permissions = await this.roleService.getUserPermissions(userId);
        
        return c.json({
          success: true,
          data: {
            userId,
            permissions
          }
        });
      } catch (error) {
        console.error('Erro ao buscar permissões:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar permissões'
        }, 500);
      }
    });

    // Restaurar permissões originais do super_admin
    this.app.post('/restore-super-admin-permissions', async (c) => {
      try {
        console.log('🔄 [RESTORE] Restaurando permissões originais do super_admin...');
        
        // Permissões originais do super_admin
        const originalPermissions = [
          "*",
          "articles:read",
          "articles:create", 
          "articles:update",
          "articles:delete",
          "articles:publish",
          "categories:read",
          "categories:create",
          "categories:update",
          "categories:delete",
          "tags:read",
          "tags:create",
          "tags:update",
          "tags:delete",
          "media:read",
          "media:update",
          "media:delete",
          "beehiiv:read",
          "beehiiv:sync",
          "beehiiv:manage",
          "workflow:read",
          "workflow:approve",
          "workflow:reject",
          "settings:read",
          "reports:read",
          "reports:export",
          "settings:update",
          "users:read",
          "users:create",
          "users:update",
          "users:delete",
          "users:manage_roles"
        ];

        // Buscar o role super_admin
        const roleResult = await this.roleService.d1Client.execute('SELECT * FROM roles WHERE name = ? AND is_active = 1', ['super_admin']);
        
        if (!roleResult.success || !roleResult.result?.results || roleResult.result.results.length === 0) {
          return c.json({
            success: false,
            error: 'Role super_admin não encontrado'
          }, 404);
        }

        const role = roleResult.result.results[0];
        console.log(`🔄 [RESTORE] Role encontrado: ${role.name}`);
        
        // Criar estrutura correta com permissões originais
        const correctStructure = {
          cms: originalPermissions,
          admin: originalPermissions  // Mesmas permissões para admin (outra aplicação)
        };

        console.log(`🏗️ [RESTORE] Estrutura com permissões originais:`, correctStructure);

        // Atualizar o role com as permissões originais
        const updateResult = await this.roleService.d1Client.execute(
          'UPDATE roles SET permissions = ? WHERE id = ?',
          [JSON.stringify(correctStructure), role.id]
        );

        if (updateResult.success) {
          console.log(`✅ [RESTORE] Role ${role.name} restaurado com sucesso`);
          
          return c.json({
            success: true,
            message: 'Permissões originais do super_admin restauradas com sucesso',
            data: {
              role: role.name,
              application: 'admin',
              permissions: originalPermissions.length,
              structure: correctStructure
            }
          });
        } else {
          console.error(`❌ [RESTORE] Erro ao restaurar role ${role.name}:`, updateResult.error);
          return c.json({
            success: false,
            error: 'Erro ao restaurar permissões do super_admin'
          }, 500);
        }

      } catch (error) {
        console.error('❌ [RESTORE] Erro geral:', error);
        return c.json({
          success: false,
          error: `Erro na restauração: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Corrigir estrutura duplicada do super_admin
    this.app.post('/fix-super-admin-structure', async (c) => {
      try {
        console.log('🔧 [FIX] Corrigindo estrutura duplicada do super_admin...');
        
        // Buscar o role super_admin
        const roleResult = await this.roleService.d1Client.execute('SELECT * FROM roles WHERE name = ? AND is_active = 1', ['super_admin']);
        
        if (!roleResult.success || !roleResult.result?.results || roleResult.result.results.length === 0) {
          return c.json({
            success: false,
            error: 'Role super_admin não encontrado'
          }, 404);
        }

        const role = roleResult.result.results[0];
        console.log(`🔧 [FIX] Estrutura atual:`, JSON.parse(role.permissions || '{}'));
        
        // Parse da estrutura atual
        const currentStructure = JSON.parse(role.permissions || '{}');
        
        // Extrair permissões da estrutura aninhada
        let permissions = [];
        if (currentStructure.admin && Array.isArray(currentStructure.admin)) {
          permissions = currentStructure.admin;
        } else if (Array.isArray(currentStructure)) {
          permissions = currentStructure;
        }

        console.log(`📋 [FIX] Permissões extraídas:`, permissions);

        // Criar estrutura correta
        const correctStructure = {
          admin: permissions
        };

        console.log(`🏗️ [FIX] Estrutura corrigida:`, correctStructure);

        // Atualizar o role com a estrutura correta
        const updateResult = await this.roleService.d1Client.execute(
          'UPDATE roles SET permissions = ? WHERE id = ?',
          [JSON.stringify(correctStructure), role.id]
        );

        if (updateResult.success) {
          console.log(`✅ [FIX] Role ${role.name} corrigido com sucesso`);
          
          return c.json({
            success: true,
            message: 'Estrutura do super_admin corrigida com sucesso',
            data: {
              role: role.name,
              oldStructure: currentStructure,
              newStructure: correctStructure,
              permissions: permissions.length
            }
          });
        } else {
          console.error(`❌ [FIX] Erro ao corrigir role ${role.name}:`, updateResult.error);
          return c.json({
            success: false,
            error: 'Erro ao corrigir estrutura do super_admin'
          }, 500);
        }

      } catch (error) {
        console.error('❌ [FIX] Erro geral:', error);
        return c.json({
          success: false,
          error: `Erro na correção: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Migrar apenas super_admin para nova estrutura
    this.app.post('/migrate-super-admin', async (c) => {
      try {
        console.log('🔄 [MIGRATION] Migrando apenas super_admin...');
        
        // Buscar apenas o role super_admin
        const roleResult = await this.roleService.d1Client.execute('SELECT * FROM roles WHERE name = ? AND is_active = 1', ['super_admin']);
        
        if (!roleResult.success || !roleResult.result?.results || roleResult.result.results.length === 0) {
          return c.json({
            success: false,
            error: 'Role super_admin não encontrado'
          }, 404);
        }

        const role = roleResult.result.results[0];
        console.log(`🔄 [MIGRATION] Processando role: ${role.name}`);
        
        // Parse das permissões atuais
        const currentPermissions = JSON.parse(role.permissions || '[]');
        console.log(`📋 [MIGRATION] Permissões atuais:`, currentPermissions);

        // Criar nova estrutura organizada para admin
        const newStructure = {
          admin: currentPermissions
        };

        console.log(`🏗️ [MIGRATION] Nova estrutura para ${role.name}:`, newStructure);

        // Atualizar o role com a nova estrutura
        const updateResult = await this.roleService.d1Client.execute(
          'UPDATE roles SET permissions = ? WHERE id = ?',
          [JSON.stringify(newStructure), role.id]
        );

        if (updateResult.success) {
          console.log(`✅ [MIGRATION] Role ${role.name} migrado com sucesso`);
          
          return c.json({
            success: true,
            message: 'Super admin migrado com sucesso',
            data: {
              role: role.name,
              application: 'admin',
              permissions: currentPermissions.length,
              newStructure
            }
          });
        } else {
          console.error(`❌ [MIGRATION] Erro ao migrar role ${role.name}:`, updateResult.error);
          return c.json({
            success: false,
            error: 'Erro ao atualizar role super_admin'
          }, 500);
        }

      } catch (error) {
        console.error('❌ [MIGRATION] Erro geral:', error);
        return c.json({
          success: false,
          error: `Erro na migração: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Migrar permissões para nova estrutura
    this.app.post('/migrate-permissions', async (c) => {
      try {
        console.log('🔄 [MIGRATION] Iniciando migração de permissões...');
        
        // Buscar todos os roles
        const rolesResult = await this.roleService.d1Client.execute('SELECT * FROM roles WHERE is_active = 1');
        
        if (!rolesResult.success || !rolesResult.result?.results) {
          return c.json({
            success: false,
            error: 'Erro ao buscar roles'
          }, 500);
        }

        console.log(`🔍 [MIGRATION] Encontrados ${rolesResult.result.results.length} roles para migrar`);
        const migratedRoles = [];

        for (const role of rolesResult.result.results) {
          console.log(`🔄 [MIGRATION] Processando role: ${role.name}`);
          
          try {
            // Parse das permissões atuais
            const currentPermissions = JSON.parse(role.permissions || '[]');
            console.log(`📋 [MIGRATION] Permissões atuais:`, currentPermissions);

            // Determinar aplicação baseada no nome do role
            let application = 'cms'; // Padrão
            
            if (role.name.includes('admin') || role.name.includes('super_admin')) {
              application = 'admin';
            } else if (role.name.includes('cms') || role.name.includes('editor') || role.name.includes('redator')) {
              application = 'cms';
            }

            // Criar nova estrutura organizada
            const newStructure = {
              [application]: currentPermissions
            };

            console.log(`🏗️ [MIGRATION] Nova estrutura para ${role.name}:`, newStructure);

            // Atualizar o role com a nova estrutura
            const updateResult = await this.roleService.d1Client.execute(
              'UPDATE roles SET permissions = ? WHERE id = ?',
              [JSON.stringify(newStructure), role.id]
            );

            if (updateResult.success) {
              console.log(`✅ [MIGRATION] Role ${role.name} migrado com sucesso`);
              migratedRoles.push({
                id: role.id,
                name: role.name,
                application,
                permissions: currentPermissions.length
              });
            } else {
              console.error(`❌ [MIGRATION] Erro ao migrar role ${role.name}:`, updateResult.error);
            }

          } catch (error) {
            console.error(`❌ [MIGRATION] Erro ao processar role ${role.name}:`, error);
          }
        }

        console.log('🎉 [MIGRATION] Migração concluída!');

        return c.json({
          success: true,
          message: 'Migração concluída com sucesso',
          data: {
            migratedRoles,
            total: migratedRoles.length
          }
        });

      } catch (error) {
        console.error('❌ [MIGRATION] Erro geral:', error);
        return c.json({
          success: false,
          error: `Erro na migração: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

  }

  getApp() {
    return this.app;
  }
}
