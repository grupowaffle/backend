/**
 * Controller de Mídia com integração direta ao Cloudflare R2
 * Funciona totalmente dentro do ecossistema Cloudflare sem URLs públicas
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CloudflareR2Service } from '../../services/CloudflareR2Service';
import { 
  fileUploadRequestSchema,
  fileDeleteRequestSchema,
  fileListRequestSchema,
  FileUploadRequestData,
  FileDeleteRequestData,
  FileListRequestData,
  SUPPORTED_MODULES
} from '../../config/types/media';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';
import { DatabaseType } from '../../repositories/BaseRepository';
import { getDrizzleClient } from '../../config/db';
import { mediaFiles, imageVariants, mediaUsage } from '../../config/db/schema';
import { eq, and, like, desc, count } from 'drizzle-orm';

// Schemas de validação específicos
const fileUploadParamsSchema = z.object({
  fileKey: z.string().min(1, 'File key is required'),
});

const fileServeParamsSchema = z.object({
  fileKey: z.string().min(1, 'File key is required'),
});

const mediaUsageSchema = z.object({
  entityType: z.string().min(1, 'Entity type is required'),
  entityId: z.string().min(1, 'Entity ID is required'),
  usage: z.string().min(1, 'Usage type is required'),
  position: z.number().int().positive().optional(),
});

export class MediaControllerR2 {
  private app: Hono;
  private r2Service: CloudflareR2Service;
  private db: DatabaseType;

  constructor(env: Env) {
    this.app = new Hono();
    this.r2Service = new CloudflareR2Service(env);
    this.db = getDrizzleClient(env);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas protegidas
    this.app.use('/upload/*', authMiddleware);
    this.app.use('/delete/*', authMiddleware);
    this.app.use('/list', authMiddleware);
    this.app.use('/usage/*', authMiddleware);

    // Gerar URL de upload pré-assinada
    this.app.post('/presigned-upload', zValidator('json', fileUploadRequestSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const data = c.req.valid('json');

        console.log(`📁 Generating presigned upload for: ${data.fileName} by ${user.email}`);

        // Criar metadados do arquivo
        const metadata = {
          fileName: data.fileName,
          fileType: data.fileType,
          fileSize: data.fileSize,
          module: data.module,
          entityId: data.entityId,
          description: data.description,
          uploadedBy: user.id.toString(),
        };

        // Gerar URL pré-assinada
        const presignedUrl = await this.r2Service.generatePresignedUpload(metadata);

        return c.json({
          success: true,
          data: presignedUrl,
        });

      } catch (error) {
        console.error('Error generating presigned upload:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro ao gerar URL de upload',
        }, 500);
      }
    });

    // Upload direto de arquivo
    this.app.put('/upload/:fileKey', zValidator('param', fileUploadParamsSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { fileKey } = c.req.valid('param');
        
        // Obter dados do arquivo do body
        const arrayBuffer = await c.req.arrayBuffer();
        
        // Obter metadados do header ou query params
        const fileName = c.req.header('x-file-name') || 'unknown';
        const fileType = c.req.header('content-type') || 'application/octet-stream';
        const module = c.req.query('module') || 'general';
        const entityId = c.req.query('entityId');
        const description = c.req.query('description');

        console.log(`📤 Direct upload: ${fileName} (${arrayBuffer.byteLength} bytes)`);

        const metadata = {
          fileName,
          fileType,
          fileSize: arrayBuffer.byteLength,
          module,
          entityId,
          description,
          uploadedBy: user.id.toString(),
        };

        // Upload para R2
        const uploadedFile = await this.r2Service.uploadFile(fileKey, arrayBuffer, metadata);

        // Salvar no banco de dados
        const [dbRecord] = await this.db
          .insert(mediaFiles)
          .values({
            id: uploadedFile.id,
            fileName: uploadedFile.fileName,
            originalFileName: fileName,
            fileType: uploadedFile.fileType,
            fileSize: uploadedFile.fileSize,
            r2Key: uploadedFile.r2Key,
            r2Url: uploadedFile.r2Url,
            internalUrl: uploadedFile.internalUrl,
            module: uploadedFile.module,
            entityId: uploadedFile.entityId,
            uploadedBy: uploadedFile.uploadedBy,
            description: uploadedFile.description,
            metadata: {},
            tags: [],
            isActive: true,
          })
          .returning();

        console.log(`✅ File uploaded and saved to DB: ${uploadedFile.id}`);

        return c.json({
          success: true,
          data: {
            ...uploadedFile,
            dbId: dbRecord.id,
          },
        });

      } catch (error) {
        console.error('Error uploading file:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro no upload do arquivo',
        }, 500);
      }
    });

    // Servir arquivo (público)
    this.app.get('/serve/:fileKey', zValidator('param', fileServeParamsSchema), async (c) => {
      try {
        const { fileKey } = c.req.valid('param');

        console.log(`🎯 Serving file: ${fileKey}`);

        // Servir arquivo do R2
        const response = await this.r2Service.serveFile(fileKey);
        
        return response;

      } catch (error) {
        console.error('Error serving file:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    });

    // Listar arquivos de mídia
    this.app.get('/list', zValidator('query', fileListRequestSchema), async (c) => {
      try {
        const user = c.get('user');
        const params = c.req.valid('query');

        console.log(`📋 Listing media files for user ${user?.email}`);

        // Construir query
        let query = this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        // Aplicar filtros
        if (params.module) {
          query = query.where(eq(mediaFiles.module, params.module));
        }
        
        if (params.entityId) {
          query = query.where(eq(mediaFiles.entityId, params.entityId));
        }

        if (params.fileType) {
          query = query.where(eq(mediaFiles.fileType, params.fileType));
        }

        if (params.search) {
          query = query.where(like(mediaFiles.fileName, `%${params.search}%`));
        }

        // Paginação
        const offset = (params.page - 1) * params.limit;
        const results = await query
          .orderBy(desc(mediaFiles.createdAt))
          .limit(params.limit)
          .offset(offset);

        // Contar total
        const [{ count: total }] = await this.db
          .select({ count: count() })
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        return c.json({
          success: true,
          data: {
            files: results,
            pagination: {
              page: params.page,
              limit: params.limit,
              total: Number(total),
              totalPages: Math.ceil(Number(total) / params.limit),
            },
          },
        });

      } catch (error) {
        console.error('Error listing media files:', error);
        return c.json({
          success: false,
          error: 'Erro ao listar arquivos de mídia',
        }, 500);
      }
    });

    // Deletar arquivo
    this.app.delete('/delete/:fileKey', zValidator('param', fileDeleteRequestSchema), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const { fileKey } = c.req.valid('param');

        console.log(`🗑️ Deleting file: ${fileKey} by ${user.email}`);

        // Verificar se usuário tem permissão
        const [fileRecord] = await this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.r2Key, fileKey))
          .limit(1);

        if (!fileRecord) {
          return c.json({
            success: false,
            error: 'Arquivo não encontrado',
          }, 404);
        }

        // Apenas admin ou owner podem deletar
        if (user.role !== 'admin' && fileRecord.uploadedBy !== user.id.toString()) {
          return c.json({
            success: false,
            error: 'Permissão negada para deletar este arquivo',
          }, 403);
        }

        // Deletar do R2
        const deleted = await this.r2Service.deleteFile(fileKey);

        if (deleted) {
          // Marcar como inativo no DB (soft delete)
          await this.db
            .update(mediaFiles)
            .set({ 
              isActive: false,
              updatedAt: new Date(),
            })
            .where(eq(mediaFiles.r2Key, fileKey));

          console.log(`✅ File deleted: ${fileKey}`);
        }

        return c.json({
          success: deleted,
          message: deleted ? 'Arquivo deletado com sucesso' : 'Erro ao deletar arquivo',
        });

      } catch (error) {
        console.error('Error deleting file:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro ao deletar arquivo',
        }, 500);
      }
    });

    // Registrar uso de mídia
    this.app.post('/usage/:fileKey', 
      zValidator('param', fileServeParamsSchema),
      zValidator('json', mediaUsageSchema), 
      async (c) => {
        try {
          const user = c.get('user');
          if (!user) {
            return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
          }

          const { fileKey } = c.req.valid('param');
          const usageData = c.req.valid('json');

          console.log(`🔗 Registering media usage: ${fileKey} → ${usageData.entityType}:${usageData.entityId}`);

          // Buscar arquivo
          const [fileRecord] = await this.db
            .select()
            .from(mediaFiles)
            .where(eq(mediaFiles.r2Key, fileKey))
            .limit(1);

          if (!fileRecord) {
            return c.json({
              success: false,
              error: 'Arquivo não encontrado',
            }, 404);
          }

          // Registrar uso
          await this.db
            .insert(mediaUsage)
            .values({
              mediaFileId: fileRecord.id,
              entityType: usageData.entityType,
              entityId: usageData.entityId,
              usage: usageData.usage,
              position: usageData.position,
            });

          return c.json({
            success: true,
            message: 'Uso de mídia registrado com sucesso',
          });

        } catch (error) {
          console.error('Error registering media usage:', error);
          return c.json({
            success: false,
            error: 'Erro ao registrar uso de mídia',
          }, 500);
        }
      }
    );

    // Obter informações detalhadas de um arquivo
    this.app.get('/info/:fileKey', zValidator('param', fileServeParamsSchema), async (c) => {
      try {
        const { fileKey } = c.req.valid('param');

        // Buscar arquivo no DB
        const [fileRecord] = await this.db
          .select()
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.r2Key, fileKey),
            eq(mediaFiles.isActive, true)
          ))
          .limit(1);

        if (!fileRecord) {
          return c.json({
            success: false,
            error: 'Arquivo não encontrado',
          }, 404);
        }

        // Buscar variantes de imagem se existirem
        const variants = await this.db
          .select()
          .from(imageVariants)
          .where(eq(imageVariants.mediaFileId, fileRecord.id));

        // Buscar usos do arquivo
        const usages = await this.db
          .select()
          .from(mediaUsage)
          .where(eq(mediaUsage.mediaFileId, fileRecord.id));

        return c.json({
          success: true,
          data: {
            file: fileRecord,
            variants,
            usages,
          },
        });

      } catch (error) {
        console.error('Error getting file info:', error);
        return c.json({
          success: false,
          error: 'Erro ao obter informações do arquivo',
        }, 500);
      }
    });

    // Health check do serviço de mídia
    this.app.get('/health', async (c) => {
      try {
        const r2Health = await this.r2Service.healthCheck();
        
        return c.json({
          success: true,
          service: 'media',
          status: r2Health.status,
          details: {
            r2Connection: r2Health.status,
            r2Details: r2Health.details,
            supportedModules: SUPPORTED_MODULES,
          },
        });

      } catch (error) {
        console.error('Media service health check failed:', error);
        return c.json({
          success: false,
          service: 'media',
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 500);
      }
    });

    // Estatísticas de uso de mídia
    this.app.get('/stats', authMiddleware, async (c) => {
      try {
        const user = c.get('user');
        
        // Apenas admins podem ver estatísticas completas
        if (user?.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Permissão negada para ver estatísticas',
          }, 403);
        }

        // Estatísticas básicas
        const [totalFiles] = await this.db
          .select({ count: count() })
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        const [totalSize] = await this.db
          .select({ size: count() }) // TODO: SUM(fileSize)
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        // Por módulo
        const byModule = await this.db
          .select({
            module: mediaFiles.module,
            count: count(),
          })
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true))
          .groupBy(mediaFiles.module);

        // Por tipo de arquivo
        const byFileType = await this.db
          .select({
            fileType: mediaFiles.fileType,
            count: count(),
          })
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true))
          .groupBy(mediaFiles.fileType);

        return c.json({
          success: true,
          data: {
            totalFiles: Number(totalFiles.count),
            totalSize: Number(totalSize.size),
            byModule: byModule.map(m => ({
              module: m.module,
              count: Number(m.count),
            })),
            byFileType: byFileType.map(ft => ({
              fileType: ft.fileType,
              count: Number(ft.count),
            })),
          },
        });

      } catch (error) {
        console.error('Error getting media stats:', error);
        return c.json({
          success: false,
          error: 'Erro ao obter estatísticas de mídia',
        }, 500);
      }
    });
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}