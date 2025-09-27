/**
 * MediaController seguindo padrão do projeto waffle
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { R2Service } from '../../services/R2Service';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';
import { getDrizzleClient } from '../../config/db';
import { mediaFiles } from '../../config/db/schema';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { generateId } from '../../lib/cuid';

// Schema para upload
const uploadSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  module: z.string().default('general'),
  description: z.string().optional(),
});

export class MediaControllerSimple {
  private app: Hono;
  private r2Service: R2Service;
  private db: ReturnType<typeof getDrizzleClient>;

  constructor(env: Env) {
    this.app = new Hono();
    this.r2Service = new R2Service(env);
    this.db = getDrizzleClient(env);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Servir arquivo do R2 (endpoint público) - DEVE VIR ANTES DO MIDDLEWARE DE AUTH
    this.app.get('/serve/*', async (c) => {
      try {
        // Capturar o caminho completo após /serve/
        const url = new URL(c.req.url);
        const pathAfterServe = url.pathname.replace('/api/cms/media/serve/', '');
        const fileKey = decodeURIComponent(pathAfterServe);
        
        console.log(`📥 Serving file: ${fileKey}`);
        console.log(`📥 Full URL: ${url.pathname}`);

        // Buscar arquivo do R2
        const file = await this.r2Service.getFileFromR2(fileKey);
        
        if (!file) {
          return c.json({ error: 'File not found' }, 404);
        }

        // Configurar headers apropriados
        const headers = new Headers();
        headers.set('Content-Type', file.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Cache-Control', 'public, max-age=31536000'); // Cache de 1 ano
        
        if (file.size) {
          headers.set('Content-Length', file.size.toString());
        }

        // Retornar o stream do arquivo
        return new Response(file.body, { headers });

      } catch (error) {
        console.error('Error serving file:', error);
        return c.json({ error: 'Failed to serve file' }, 500);
      }
    });

    // Middleware de autenticação
    this.app.use('/upload', authMiddleware);
    this.app.use('/search', authMiddleware);
    this.app.use('/list', authMiddleware);
    this.app.use('/', authMiddleware);
    this.app.use('/:id', authMiddleware);
    this.app.use('/delete/*', authMiddleware);

    // Upload de arquivo (seguindo exatamente o padrão waffle)
    this.app.post('/upload', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ error: 'Usuário não autenticado' }, 401);
        }

        const formData = await c.req.formData();
        const file = formData.get('file') as File;
        const module = (formData.get('module') as string) || 'general';
        const description = formData.get('description') as string;

        if (!file) {
          return c.json({ error: 'No file provided' }, 400);
        }

        console.log(`📤 Uploading file: ${file.name} (${file.size} bytes) by ${user.email}`);

        // Upload para R2 seguindo padrão waffle
        console.log('🔧 Starting R2 upload...');
        const url = await this.uploadToR2(file, file.name, c.env);
        console.log('✅ R2 upload completed, URL:', url);

        // Salvar metadados no banco (apenas essenciais)
        const mediaRecord = await this.db
          .insert(mediaFiles)
          .values({
            id: generateId(),
            fileName: file.name,
            originalFileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            r2Key: this.extractKeyFromUrl(url),
            internalUrl: url,
            module: module,
            uploadedBy: user.id.toString(),
            description: description || null,
            tags: [],
            metadata: {},
          })
          .returning();

        console.log(`✅ File uploaded successfully: ${mediaRecord[0].id}`);

        // Transform response to match frontend UploadResponse interface
        const transformedFile = {
          id: mediaRecord[0].id,
          filename: file.name,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          url: url,
          thumbnailUrl: file.type.startsWith('image/') ? url : undefined,
          alt: file.name,
          caption: description,
          description: description,
          tags: [],
          folder: module,
          isPublic: true,
          uploadedBy: user.id.toString(),
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        return c.json({
          success: true,
          data: transformedFile
        });

      } catch (error) {
        console.error('Error uploading file:', error);
        return c.json({ 
          error: error instanceof Error ? error.message : 'Upload failed' 
        }, 500);
      }
    });

    // Listar arquivos (rota principal)
    this.app.get('/', async (c) => {
      try {
        const user = c.get('user');
        const page = parseInt(c.req.query('page') || '1');
        const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
        const module = c.req.query('module');

        console.log(`📋 Listing media files for user ${user?.email}`);

        let query = this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        if (module) {
          query = query.where(eq(mediaFiles.module, module));
        }

        const offset = (page - 1) * limit;

        // Get total count
        const totalResult = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        const total = totalResult[0]?.count || 0;

        const files = await query
          .orderBy(desc(mediaFiles.createdAt))
          .limit(limit)
          .offset(offset);

        // Transform files to match frontend MediaFile interface
        const transformedFiles = files.map(file => ({
          id: file.id,
          filename: file.fileName,
          originalName: file.originalFileName,
          mimeType: file.fileType,
          size: file.fileSize,
          url: file.internalUrl,
          thumbnailUrl: file.fileType.startsWith('image/') ? file.internalUrl : undefined,
          alt: file.description || file.fileName,
          caption: file.description,
          description: file.description,
          tags: file.tags || [],
          folder: file.module,
          isPublic: true, // For now, all files are public
          uploadedBy: file.uploadedBy,
          uploadedAt: file.createdAt.toISOString(),
          updatedAt: file.updatedAt.toISOString(),
        }));

        return c.json({
          success: true,
          data: {
            files: transformedFiles,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          }
        });

      } catch (error) {
        console.error('Error listing files:', error);
        return c.json({ error: 'Failed to list files' }, 500);
      }
    });

    // Buscar arquivos por termo
    this.app.get('/search', async (c) => {
      try {
        const user = c.get('user');
        const query = c.req.query('q');
        const page = parseInt(c.req.query('page') || '1');
        const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
        const module = c.req.query('module');

        if (!query || query.length < 2) {
          return c.json({
            success: false,
            error: 'Query must be at least 2 characters long'
          }, 400);
        }

        console.log(`🔍 Searching media files: "${query}"`);

        // Buscar por nome do arquivo, descrição ou tags
        const searchQuery = `%${query.toLowerCase()}%`;
        
        let dbQuery = this.db
          .select()
          .from(mediaFiles)
          .where(
            and(
              eq(mediaFiles.isActive, true),
              or(
                sql`LOWER(${mediaFiles.fileName}) LIKE ${searchQuery}`,
                sql`LOWER(${mediaFiles.originalFileName}) LIKE ${searchQuery}`,
                sql`LOWER(${mediaFiles.description}) LIKE ${searchQuery}`,
                sql`LOWER(${mediaFiles.alt}) LIKE ${searchQuery}`
              )
            )
          );

        if (module) {
          dbQuery = dbQuery.where(eq(mediaFiles.module, module));
        }

        const offset = (page - 1) * limit;
        const files = await dbQuery
          .orderBy(desc(mediaFiles.createdAt))
          .limit(limit)
          .offset(offset);

        return c.json({
          success: true,
          data: {
            files,
            query,
            pagination: {
              page,
              limit,
              hasMore: files.length === limit
            }
          }
        });

      } catch (error) {
        console.error('Error searching files:', error);
        return c.json({
          success: false,
          error: 'Failed to search files'
        }, 500);
      }
    });

    // Listar arquivos (rota alternativa)
    this.app.get('/list', async (c) => {
      try {
        const user = c.get('user');
        const page = parseInt(c.req.query('page') || '1');
        const limit = Math.min(50, parseInt(c.req.query('limit') || '20'));
        const module = c.req.query('module');

        console.log(`📋 Listing media files for user ${user?.email}`);

        let query = this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        if (module) {
          query = query.where(eq(mediaFiles.module, module));
        }

        const offset = (page - 1) * limit;
        const files = await query
          .orderBy(desc(mediaFiles.createdAt))
          .limit(limit)
          .offset(offset);

        return c.json({
          success: true,
          data: {
            files,
            pagination: {
              page,
              limit,
              hasMore: files.length === limit
            }
          }
        });

      } catch (error) {
        console.error('Error listing files:', error);
        return c.json({ error: 'Failed to list files' }, 500);
      }
    });

    // Buscar arquivo por ID
    this.app.get('/:id', async (c) => {
      try {
        const user = c.get('user');
        const fileId = c.req.param('id');

        console.log(`🔍 Getting media file: ${fileId}`);

        const [file] = await this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.id, fileId))
          .limit(1);

        if (!file) {
          return c.json({
            success: false,
            error: 'Media file not found'
          }, 404);
        }

        // Verificar se o arquivo está ativo
        if (!file.isActive) {
          return c.json({
            success: false,
            error: 'Media file is not active'
          }, 404);
        }

        return c.json({
          success: true,
          data: file
        });

      } catch (error) {
        console.error('Error getting media file:', error);
        return c.json({
          success: false,
          error: 'Failed to get media file'
        }, 500);
      }
    });

    // Atualizar arquivo por ID
    this.app.put('/:id', async (c) => {
      try {
        const user = c.get('user');
        const fileId = c.req.param('id');
        const body = await c.req.json();

        console.log(`✏️ Updating media file: ${fileId}`);

        // Buscar arquivo existente
        const [existingFile] = await this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.id, fileId))
          .limit(1);

        if (!existingFile) {
          return c.json({
            success: false,
            error: 'Media file not found'
          }, 404);
        }

        // Verificar se o arquivo está ativo
        if (!existingFile.isActive) {
          return c.json({
            success: false,
            error: 'Media file is not active'
          }, 404);
        }

        // Verificar permissão (admin ou dono do arquivo)
        if (user?.role !== 'admin' && existingFile.uploadedBy !== user?.id.toString()) {
          return c.json({
            success: false,
            error: 'Permission denied'
          }, 403);
        }

        // Preparar dados para atualização
        const updateData: any = {
          updatedAt: new Date()
        };

        // Campos que podem ser atualizados
        if (body.description !== undefined) updateData.description = body.description;
        if (body.alt !== undefined) updateData.alt = body.alt;
        if (body.tags !== undefined) updateData.tags = body.tags;
        if (body.metadata !== undefined) updateData.metadata = body.metadata;
        if (body.module !== undefined) updateData.module = body.module;
        if (body.entityId !== undefined) updateData.entityId = body.entityId;

        // Atualizar no banco
        const [updatedFile] = await this.db
          .update(mediaFiles)
          .set(updateData)
          .where(eq(mediaFiles.id, fileId))
          .returning();

        console.log(`✅ Media file updated successfully: ${fileId}`);

        return c.json({
          success: true,
          data: updatedFile,
          message: 'Media file updated successfully'
        });

      } catch (error) {
        console.error('Error updating media file:', error);
        return c.json({
          success: false,
          error: 'Failed to update media file'
        }, 500);
      }
    });

    // Deletar arquivo por ID (rota principal)
    this.app.delete('/:id', async (c) => {
      try {
        const user = c.get('user');
        const fileId = c.req.param('id');

        console.log(`🗑️ Deleting media file: ${fileId}`);

        // Buscar arquivo
        const [file] = await this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.id, fileId))
          .limit(1);

        if (!file) {
          return c.json({
            success: false,
            error: 'Media file not found'
          }, 404);
        }

        // Verificar se o arquivo está ativo
        if (!file.isActive) {
          return c.json({
            success: false,
            error: 'Media file is not active'
          }, 404);
        }

        // Verificar permissão (admin ou dono do arquivo)
        if (user?.role !== 'admin' && file.uploadedBy !== user?.id.toString()) {
          return c.json({
            success: false,
            error: 'Permission denied'
          }, 403);
        }

        console.log(`🗑️ Deleting file: ${file.fileName} by ${user?.email}`);

        // Deletar do R2
        const deleted = await this.r2Service.deleteFromR2(file.r2Key);

        if (deleted) {
          // Marcar como inativo no banco
          await this.db
            .update(mediaFiles)
            .set({ 
              isActive: false,
              updatedAt: new Date()
            })
            .where(eq(mediaFiles.id, fileId));
        }

        return c.json({
          success: deleted,
          message: deleted ? 'Media file deleted successfully' : 'Failed to delete media file'
        });

      } catch (error) {
        console.error('Error deleting media file:', error);
        return c.json({
          success: false,
          error: 'Failed to delete media file'
        }, 500);
      }
    });

    // Deletar arquivo (rota alternativa)
    this.app.delete('/delete/:id', async (c) => {
      try {
        const user = c.get('user');
        const fileId = c.req.param('id');

        // Buscar arquivo
        const [file] = await this.db
          .select()
          .from(mediaFiles)
          .where(eq(mediaFiles.id, fileId))
          .limit(1);

        if (!file) {
          return c.json({ error: 'File not found' }, 404);
        }

        // Verificar permissão
        if (user?.role !== 'admin' && file.uploadedBy !== user?.id.toString()) {
          return c.json({ error: 'Permission denied' }, 403);
        }

        console.log(`🗑️ Deleting file: ${file.fileName} by ${user?.email}`);

        // Deletar do R2
        const deleted = await this.r2Service.deleteFromR2(file.r2Key);

        if (deleted) {
          // Marcar como inativo no banco
          await this.db
            .update(mediaFiles)
            .set({ 
              isActive: false,
              updatedAt: new Date()
            })
            .where(eq(mediaFiles.id, fileId));
        }

        return c.json({
          success: deleted,
          message: deleted ? 'File deleted successfully' : 'Failed to delete file'
        });

      } catch (error) {
        console.error('Error deleting file:', error);
        return c.json({ error: 'Failed to delete file' }, 500);
      }
    });


    // Health check
    this.app.get('/health', async (c) => {
      try {
        const r2Health = await this.r2Service.healthCheck();

        return c.json({
          success: true,
          service: 'media',
          r2Status: r2Health.status,
          details: r2Health.details
        });

      } catch (error) {
        return c.json({
          success: false,
          service: 'media',
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Estatísticas de mídia
    this.app.get('/stats', async (c) => {
      try {
        const user = c.get('user');
        console.log(`📊 Getting media stats for user ${user?.email}`);

        // Get total files and size
        const totalResult = await this.db
          .select({
            count: sql<number>`count(*)`,
            totalSize: sql<number>`sum(${mediaFiles.fileSize})`
          })
          .from(mediaFiles)
          .where(eq(mediaFiles.isActive, true));

        // Get counts by type
        const imageCount = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.isActive, true),
            sql`${mediaFiles.fileType} LIKE 'image/%'`
          ));

        const videoCount = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.isActive, true),
            sql`${mediaFiles.fileType} LIKE 'video/%'`
          ));

        const audioCount = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.isActive, true),
            sql`${mediaFiles.fileType} LIKE 'audio/%'`
          ));

        const documentCount = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.isActive, true),
            sql`${mediaFiles.fileType} LIKE 'application/%'`
          ));

        // Get recent uploads (last 7 days)
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const recentCount = await this.db
          .select({ count: sql<number>`count(*)` })
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.isActive, true),
            sql`${mediaFiles.createdAt} >= ${weekAgo.toISOString()}`
          ));

        const stats = {
          totalFiles: totalResult[0]?.count || 0,
          totalSize: totalResult[0]?.totalSize || 0,
          imagesCount: imageCount[0]?.count || 0,
          videosCount: videoCount[0]?.count || 0,
          audioCount: audioCount[0]?.count || 0,
          documentsCount: documentCount[0]?.count || 0,
          recentUploads: recentCount[0]?.count || 0,
        };

        return c.json({
          success: true,
          data: stats
        });

      } catch (error) {
        console.error('Error getting media stats:', error);
        return c.json({
          success: false,
          error: 'Failed to get media stats'
        }, 500);
      }
    });

    // Listar pastas (módulos)
    this.app.get('/folders', async (c) => {
      try {
        const user = c.get('user');
        console.log(`📁 Getting folders for user ${user?.email}`);

        const folders = await this.db
          .selectDistinct({ module: mediaFiles.module })
          .from(mediaFiles)
          .where(and(
            eq(mediaFiles.isActive, true),
            sql`${mediaFiles.module} IS NOT NULL`
          ))
          .orderBy(mediaFiles.module);

        const folderNames = folders.map(f => f.module).filter(Boolean);

        return c.json({
          success: true,
          data: folderNames
        });

      } catch (error) {
        console.error('Error getting folders:', error);
        return c.json({
          success: false,
          error: 'Failed to get folders'
        }, 500);
      }
    });
  }

  /**
   * Upload para R2 (método privado seguindo padrão waffle)
   */
  private async uploadToR2(file: File, fileName: string, env: any): Promise<string> {
    const key = `uploads/${Date.now()}-${fileName}`;
    console.log('🔧 R2 upload - Key:', key);
    console.log('🔧 R2 upload - File size:', file.size);
    console.log('🔧 R2 upload - File type:', file.type);
    console.log('🔧 R2 upload - FILE_STORAGE available:', !!env.FILE_STORAGE);

    try {
      // Verificar se FILE_STORAGE está disponível
      if (!env.FILE_STORAGE) {
        throw new Error('FILE_STORAGE not available in environment');
      }

      await env.FILE_STORAGE.put(key, file.stream(), {
        httpMetadata: {
          contentType: file.type
        }
      });
      console.log('✅ R2 upload successful for key:', key);
    } catch (error) {
      console.error('❌ R2 upload failed:', error);
      console.error('❌ Error details:', error.message);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }

    // Retorna URL via Worker (sem exposição direta do bucket)
    return `/api/cms/media/serve/${key}`;
  }

  /**
   * Extrair chave da URL do R2
   */
  private extractKeyFromUrl(url: string): string {
    // URL format: /api/cms/media/serve/uploads/1758982033341-filename.ext
    // Extract: uploads/1758982033341-filename.ext
    if (url.startsWith('/api/cms/media/serve/')) {
      return url.replace('/api/cms/media/serve/', '');
    }
    return url;
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}