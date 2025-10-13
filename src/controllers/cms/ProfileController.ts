import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { generateId } from '../../lib/cuid';
import { ProfileRepository } from '../../repositories/ProfileRepository';

// Schema de validação para criar perfil
const createProfileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().optional(),
  role: z.string().min(1, 'Role é obrigatório'),
  permissions: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});

// Schema de validação para atualizar perfil
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').optional(),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

export class ProfileController {
  private app: Hono;
  private env: Env;
  private db: ReturnType<typeof getDrizzleClient>;
  private profileRepository: ProfileRepository;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    this.db = getDrizzleClient(env);
    this.profileRepository = new ProfileRepository(this.db as any);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Listar todos os perfis
    this.app.get('/', async (c) => {
      try {
        const profiles = await this.profileRepository.getAll();
        
        console.log('📋 [GET PROFILES] Retornando perfis:', profiles.length);
        console.log('📋 [GET PROFILES] Perfis atuais:', profiles.map(p => ({ id: p.id, name: p.name, role: p.role })));

        return c.json({
          success: true,
          data: profiles
        });
      } catch (error) {
        console.error('❌ [GET PROFILES] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar perfis'
        }, 500);
      }
    });

    // Endpoint de teste sem autenticação
    this.app.get('/test', async (c) => {
      try {
        return c.json({
          success: true,
          message: 'Endpoint de teste funcionando',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return c.json({
          success: false,
          error: 'Erro no endpoint de teste'
        }, 500);
      }
    });

    // Endpoint de teste com dados de perfis
    this.app.get('/test-data', async (c) => {
      try {
        const profiles = await this.profileRepository.getAll();
        return c.json({
          success: true,
          message: 'Dados de teste funcionando',
          data: profiles,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return c.json({
          success: false,
          error: 'Erro no endpoint de teste de dados'
        }, 500);
      }
    });

    // Buscar perfil por ID
    this.app.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        
        console.log('🔍 [GET PROFILE] ID:', id);
        
        const profile = await this.profileRepository.getById(id);
        
        if (!profile) {
          return c.json({
            success: false,
            error: 'Perfil não encontrado'
          }, 404);
        }

        console.log('✅ [GET PROFILE] Perfil encontrado:', { id: profile.id, name: profile.name, role: profile.role });

        return c.json({
          success: true,
          data: profile
        });
      } catch (error) {
        console.error('❌ [GET PROFILE] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao buscar perfil'
        }, 500);
      }
    });

    // Criar novo perfil
    this.app.post('/', zValidator('json', createProfileSchema), async (c) => {
      try {
        const data = c.req.valid('json');
        const user = c.get('user');
        
        console.log('📝 [CREATE PROFILE] Dados recebidos:', data);
        console.log('📝 [CREATE PROFILE] Usuário:', user?.email);
        
        // Criar novo perfil no banco
        const newProfile = await this.profileRepository.create({
          name: data.name,
          description: data.description || '',
          role: data.role,
          permissions: data.permissions || [],
          isActive: data.isActive !== undefined ? data.isActive : true,
          isDefault: data.isDefault || false,
          createdBy: user?.id?.toString() || 'system'
        });

        console.log('✅ [CREATE PROFILE] Perfil criado:', { id: newProfile.id, name: newProfile.name, role: newProfile.role });

        return c.json({
          success: true,
          message: 'Perfil criado com sucesso',
          data: newProfile
        }, 201);
      } catch (error) {
        console.error('❌ [CREATE PROFILE] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao criar perfil'
        }, 500);
      }
    });

    // Atualizar perfil
    this.app.put('/:id', zValidator('json', updateProfileSchema), async (c) => {
      try {
        const id = c.req.param('id');
        const data = c.req.valid('json');
        
        console.log('📝 [UPDATE PROFILE] ID:', id);
        console.log('📝 [UPDATE PROFILE] Dados recebidos:', data);
        
        // Verificar se perfil existe
        const existingProfile = await this.profileRepository.getById(id);
        if (!existingProfile) {
          return c.json({
            success: false,
            error: 'Perfil não encontrado'
          }, 404);
        }

        // Atualizar perfil no banco
        const updatedProfile = await this.profileRepository.update(id, {
          name: data.name,
          description: data.description,
          permissions: data.permissions,
          isActive: data.isActive,
          isDefault: data.isDefault
        });

        console.log('✅ [UPDATE PROFILE] Perfil atualizado:', { id: updatedProfile.id, name: updatedProfile.name, role: updatedProfile.role });

        return c.json({
          success: true,
          message: 'Perfil atualizado com sucesso',
          data: updatedProfile
        });
      } catch (error) {
        console.error('❌ [UPDATE PROFILE] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao atualizar perfil'
        }, 500);
      }
    });

    // Excluir perfil
    this.app.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        
        console.log('🗑️ [DELETE PROFILE] ID:', id);
        
        // Verificar se perfil existe
        const existingProfile = await this.profileRepository.getById(id);
        if (!existingProfile) {
          return c.json({
            success: false,
            error: 'Perfil não encontrado'
          }, 404);
        }

        // Soft delete - marcar como inativo
        await this.profileRepository.delete(id);

        console.log('✅ [DELETE PROFILE] Perfil excluído:', { id, name: existingProfile.name });

        return c.json({
          success: true,
          message: 'Perfil excluído com sucesso'
        });
      } catch (error) {
        console.error('❌ [DELETE PROFILE] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao excluir perfil'
        }, 500);
      }
    });

    // Criar tabela de perfis (endpoint temporário)
    this.app.post('/create-table', async (c) => {
      try {
        console.log('🔧 [CREATE TABLE] Criando tabela profiles...');
        
        // SQL para criar a tabela
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            role TEXT NOT NULL,
            permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
            "isActive" BOOLEAN NOT NULL DEFAULT true,
            "isDefault" BOOLEAN NOT NULL DEFAULT false,
            "createdBy" TEXT NOT NULL,
            "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
          );
        `;

        // Executar SQL - cada comando separadamente
        await (this.db as any).execute(createTableSQL);
        
        // Criar índices separadamente
        await (this.db as any).execute(`CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);`);
        await (this.db as any).execute(`CREATE INDEX IF NOT EXISTS profiles_active_idx ON profiles("isActive");`);
        await (this.db as any).execute(`CREATE INDEX IF NOT EXISTS profiles_created_by_idx ON profiles("createdBy");`);

        // Inserir perfis padrão
        const insertSuperAdmin = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_super_admin', 'Super Administrador', 'Acesso total ao sistema', 'super_admin', '["admin:all"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;
        
        const insertAdmin = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_admin', 'Administrador', 'Gestão completa do sistema', 'admin', '["articles:read","articles:create","articles:update","articles:delete","articles:publish","categories:read","categories:create","categories:update","categories:delete","media:read","media:upload","media:delete","users:read","users:create","users:update","users:delete","workflow:read","workflow:approve","workflow:reject","beehiiv:read","beehiiv:sync","reports:read","settings:read","settings:update","notifications:read","notifications:configure"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;
        
        const insertEditor = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_editor', 'Editor', 'Gestão de conteúdo e aprovação', 'editor', '["articles:read","articles:create","articles:update","articles:publish","categories:read","media:read","media:upload","workflow:read","workflow:approve","workflow:reject","beehiiv:read","reports:read"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;
        
        const insertRedator = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_redator', 'Redator', 'Criação e edição de conteúdo', 'redator', '["articles:read","articles:create","articles:update","categories:read","media:read","media:upload","workflow:read","beehiiv:read"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;
        
        const insertAnalista = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_analista', 'Analista', 'Análise de dados e relatórios', 'analista', '["articles:read","reports:read","reports:export","beehiiv:read"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;
        
        const insertTecnico = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_tecnico', 'Técnico', 'Suporte técnico e integrações', 'tecnico', '["articles:read","beehiiv:read","beehiiv:sync","settings:read"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;
        
        const insertVisualizador = `
          INSERT INTO profiles (id, name, description, role, permissions, "isActive", "isDefault", "createdBy") VALUES
          ('profile_visualizador', 'Visualizador', 'Apenas visualização', 'visualizador', '["articles:read","categories:read","media:read","reports:read"]'::jsonb, true, true, 'system')
          ON CONFLICT (id) DO NOTHING;
        `;

        // Executar inserções separadamente
        await (this.db as any).execute(insertSuperAdmin);
        await (this.db as any).execute(insertAdmin);
        await (this.db as any).execute(insertEditor);
        await (this.db as any).execute(insertRedator);
        await (this.db as any).execute(insertAnalista);
        await (this.db as any).execute(insertTecnico);
        await (this.db as any).execute(insertVisualizador);

        console.log('✅ [CREATE TABLE] Tabela profiles criada com sucesso!');

        return c.json({
          success: true,
          message: 'Tabela profiles criada com sucesso!'
        });
      } catch (error) {
        console.error('❌ [CREATE TABLE] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao criar tabela profiles'
        }, 500);
      }
    });

    // Duplicar perfil
    this.app.post('/:id/duplicate', zValidator('json', z.object({
      name: z.string().min(1, 'Nome é obrigatório')
    })), async (c) => {
      try {
        const id = c.req.param('id');
        const { name } = c.req.valid('json');
        
        console.log('📋 [DUPLICATE PROFILE] ID:', id);
        console.log('📋 [DUPLICATE PROFILE] Nome:', name);
        
        // Mock response - substituir por duplicação real no banco
        const duplicatedProfile = {
          id: generateId(),
          name,
          description: 'Cópia do perfil original',
          role: 'editor',
          permissions: ['articles:read', 'articles:create'],
          isActive: true,
          isDefault: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: 'admin'
        };

        console.log('✅ [DUPLICATE PROFILE] Perfil duplicado:', duplicatedProfile);

        return c.json({
          success: true,
          message: 'Perfil duplicado com sucesso',
          data: duplicatedProfile
        });
      } catch (error) {
        console.error('❌ [DUPLICATE PROFILE] Erro:', error);
        return c.json({
          success: false,
          error: 'Erro ao duplicar perfil'
        }, 500);
      }
    });
  }

  getApp() {
    return this.app;
  }
}
