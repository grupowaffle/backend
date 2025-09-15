import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { ImageService } from '../../services/ImageService';
import { ImageUploadService, ImageUploadOptions } from '../../services/ImageUploadService';
import { Env } from '../../config/types/common';
import { authMiddleware } from '../../middlewares/auth';

// Validation schemas
const uploadImageSchema = z.object({
  alt: z.string().optional(),
  title: z.string().optional(),
  folder: z.string().optional(),
  maxWidth: z.number().min(100).max(4000).optional(),
  maxHeight: z.number().min(100).max(4000).optional(),
  quality: z.number().min(1).max(100).optional(),
});

const listImagesSchema = z.object({
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional(),
  folder: z.string().optional(),
});

export class MediaController {
  private app: Hono;
  private env: Env;
  private imageService: ImageService;
  private imageUploadService: ImageUploadService;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    this.imageService = new ImageService(env);
    this.imageUploadService = new ImageUploadService(env);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Middleware de autenticação para todas as rotas
    this.app.use('*', authMiddleware);

    // Health check for media service (MUST be before /:id route)
    this.app.get('/health', async (c) => {
      try {
        // Basic health check - could be expanded to check R2 connectivity
        return c.json({
          success: true,
          service: 'media',
          status: 'healthy',
          timestamp: new Date().toISOString(),
          features: {
            upload: true,
            batchUpload: true,
            r2Storage: true,
            neonMetadata: true,
          },
        });
      } catch (error) {
        return c.json({
          success: false,
          service: 'media',
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        }, 500);
      }
    });

    // Upload single image
    this.app.post('/upload', async (c) => {
      try {
        console.log('🖼️ Starting image upload...');

        // Get form data
        const formData = await c.req.formData();
        const file = formData.get('file') as File;
        
        if (!file) {
          return c.json({
            success: false,
            error: 'No file provided',
          }, 400);
        }

        // Get optional parameters
        const alt = formData.get('alt')?.toString();
        const title = formData.get('title')?.toString();
        const folder = formData.get('folder')?.toString();
        const maxWidth = formData.get('maxWidth') ? parseInt(formData.get('maxWidth').toString()) : undefined;
        const maxHeight = formData.get('maxHeight') ? parseInt(formData.get('maxHeight').toString()) : undefined;
        const quality = formData.get('quality') ? parseInt(formData.get('quality').toString()) : undefined;

        const options = {
          alt,
          title,
          folder,
          maxWidth,
          maxHeight,
          quality,
        };

        console.log('📝 Upload options:', options);

        // Upload image
        const result = await this.imageService.uploadImage(file, options);

        console.log('✅ Image uploaded successfully:', result.id);

        return c.json({
          success: true,
          data: result,
        });

      } catch (error) {
        console.error('❌ Error in image upload endpoint:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to upload image',
        }, 500);
      }
    });

    // Upload multiple images
    this.app.post('/upload-batch', async (c) => {
      try {
        console.log('🖼️ Starting batch image upload...');

        const formData = await c.req.formData();
        const files = formData.getAll('files') as File[];
        
        if (!files || files.length === 0) {
          return c.json({
            success: false,
            error: 'No files provided',
          }, 400);
        }

        // Get optional parameters (apply to all files)
        const alt = formData.get('alt')?.toString();
        const title = formData.get('title')?.toString();
        const folder = formData.get('folder')?.toString();
        const maxWidth = formData.get('maxWidth') ? parseInt(formData.get('maxWidth').toString()) : undefined;
        const maxHeight = formData.get('maxHeight') ? parseInt(formData.get('maxHeight').toString()) : undefined;
        const quality = formData.get('quality') ? parseInt(formData.get('quality').toString()) : undefined;

        const options = {
          alt,
          title,
          folder,
          maxWidth,
          maxHeight,
          quality,
        };

        const results = [];
        const errors = [];

        console.log(`📊 Uploading ${files.length} files...`);

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          try {
            console.log(`📤 Uploading file ${i + 1}/${files.length}: ${file.name}`);
            const result = await this.imageService.uploadImage(file, {
              ...options,
              title: options.title || file.name, // Use filename as fallback title
            });
            results.push(result);
          } catch (error) {
            console.error(`❌ Failed to upload ${file.name}:`, error);
            errors.push({
              filename: file.name,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }

        console.log(`✅ Batch upload completed. Success: ${results.length}, Errors: ${errors.length}`);

        return c.json({
          success: true,
          data: {
            uploaded: results,
            failed: errors,
            summary: {
              total: files.length,
              successful: results.length,
              failed: errors.length,
            },
          },
        });

      } catch (error) {
        console.error('❌ Error in batch upload endpoint:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to upload images',
        }, 500);
      }
    });

    // List images with pagination and filtering
    this.app.get('/', zValidator('query', listImagesSchema), async (c) => {
      try {
        const { page, limit, folder } = c.req.valid('query');

        console.log('📋 Listing images with options:', { page, limit, folder });

        const result = await this.imageService.listImages({
          page,
          limit,
          folder,
        });

        return c.json({
          success: true,
          data: result,
        });

      } catch (error) {
        console.error('❌ Error listing images:', error);
        return c.json({
          success: false,
          error: 'Failed to list images',
        }, 500);
      }
    });

    // Get single image metadata
    this.app.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        
        console.log('🔍 Getting image metadata:', id);

        const image = await this.imageService.getImageMetadata(id);
        
        if (!image) {
          return c.json({
            success: false,
            error: 'Image not found',
          }, 404);
        }

        return c.json({
          success: true,
          data: image,
        });

      } catch (error) {
        console.error('❌ Error getting image:', error);
        return c.json({
          success: false,
          error: 'Failed to get image',
        }, 500);
      }
    });

    // Delete image
    this.app.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        
        console.log('🗑️ Deleting image:', id);

        const success = await this.imageService.deleteImage(id);
        
        if (!success) {
          return c.json({
            success: false,
            error: 'Image not found or could not be deleted',
          }, 404);
        }

        console.log('✅ Image deleted successfully:', id);

        return c.json({
          success: true,
          message: 'Image deleted successfully',
        });

      } catch (error) {
        console.error('❌ Error deleting image:', error);
        return c.json({
          success: false,
          error: 'Failed to delete image',
        }, 500);
      }
    });

    // ========== NOVOS ENDPOINTS PARA UPLOAD AVANÇADO ==========

    // Upload avançado com processamento de imagem
    this.app.post('/advanced-upload', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log(`📤 Advanced image upload for user ${user.name} (${user.id})`);

        // Parse multipart form data
        const formData = await c.req.formData();
        const file = formData.get('image') as File;
        
        if (!file) {
          return c.json({ 
            success: false, 
            error: 'Nenhuma imagem enviada. Use o campo "image" no form.' 
          }, 400);
        }

        // Validar tamanho do arquivo (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
          return c.json({
            success: false,
            error: 'Arquivo muito grande. Máximo: 10MB'
          }, 400);
        }

        // Obter opções de upload
        const options: ImageUploadOptions & { folder?: string; userId: string; userName: string } = {
          folder: formData.get('folder')?.toString() || 'articles',
          quality: parseInt(formData.get('quality')?.toString() || '85'),
          generateThumbnail: formData.get('generateThumbnail')?.toString() !== 'false',
          watermark: formData.get('watermark')?.toString() === 'true',
          userId: user.id,
          userName: user.name || user.email,
        };

        // Parse dimensões se fornecidas
        const width = formData.get('width')?.toString();
        const height = formData.get('height')?.toString();
        if (width) options.width = parseInt(width);
        if (height) options.height = parseInt(height);

        // Parse formato
        const format = formData.get('format')?.toString();
        if (format && ['jpeg', 'webp', 'png'].includes(format)) {
          options.format = format as 'jpeg' | 'webp' | 'png';
        }

        // Fazer upload usando o serviço avançado
        const result = await this.imageUploadService.uploadImage(file, options);

        return c.json({
          success: true,
          message: 'Imagem processada e enviada com sucesso',
          data: result,
        }, 201);

      } catch (error) {
        console.error('Error in advanced upload:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro no upload avançado',
        }, 500);
      }
    });

    // Gerar URL pré-assinada para upload direto
    this.app.post('/generate-upload-url', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const body = await c.req.json();
        const { filename, contentType, folder = 'articles', expiresIn = 3600 } = body;

        if (!filename || !contentType) {
          return c.json({
            success: false,
            error: 'filename e contentType são obrigatórios'
          }, 400);
        }

        // Gerar nome único para o arquivo
        const timestamp = Date.now();
        const uniqueId = Math.random().toString(36).substr(2, 9);
        const extension = filename.split('.').pop();
        const key = `${folder}/${timestamp}_${uniqueId}.${extension}`;

        console.log(`🔗 Generating upload URL for ${key} (expires in ${expiresIn}s)`);

        const uploadUrl = await this.imageUploadService.generateUploadUrl(key, contentType, expiresIn);

        return c.json({
          success: true,
          data: {
            uploadUrl,
            key,
            expiresIn,
            publicUrl: `${this.env.CLOUDFLARE_PUBLIC_URL}/${key}`,
          },
        });

      } catch (error) {
        console.error('Error generating upload URL:', error);
        return c.json({
          success: false,
          error: 'Erro ao gerar URL de upload',
        }, 500);
      }
    });

    // Listar imagens com paginação avançada
    this.app.get('/advanced-list', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const folder = c.req.query('folder') || 'articles';
        const limit = parseInt(c.req.query('limit') || '20');
        const continuationToken = c.req.query('continuationToken');

        console.log(`📋 Advanced listing images in ${folder}/ (limit: ${limit})`);

        const result = await this.imageUploadService.listImages(folder, {
          limit,
          continuationToken,
        });

        return c.json({
          success: true,
          data: result.images,
          pagination: {
            limit,
            hasMore: result.hasMore,
            nextToken: result.nextToken,
          },
        });

      } catch (error) {
        console.error('Error in advanced listing:', error);
        return c.json({
          success: false,
          error: 'Erro ao listar imagens',
        }, 500);
      }
    });

    // Deletar imagem pelo ID/key
    this.app.delete('/advanced/:key(*)', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem deletar imagens',
          }, 403);
        }

        const key = c.req.param('key');
        
        if (!key) {
          return c.json({
            success: false,
            error: 'Chave da imagem não fornecida',
          }, 400);
        }

        console.log(`🗑️ Deleting image: ${key} by ${user.name}`);

        const success = await this.imageUploadService.deleteImage(key);

        if (success) {
          return c.json({
            success: true,
            message: 'Imagem removida com sucesso',
          });
        } else {
          return c.json({
            success: false,
            error: 'Falha ao remover imagem',
          }, 500);
        }

      } catch (error) {
        console.error('Error deleting image:', error);
        return c.json({
          success: false,
          error: 'Erro ao remover imagem',
        }, 500);
      }
    });

    // Otimizar imagem existente
    this.app.post('/optimize/:key(*)', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        // Verificar permissões
        if (!['admin', 'editor-chefe'].includes(user.role)) {
          return c.json({
            success: false,
            error: 'Apenas administradores e editores-chefe podem otimizar imagens',
          }, 403);
        }

        const key = c.req.param('key');
        const body = await c.req.json();

        if (!key) {
          return c.json({
            success: false,
            error: 'Chave da imagem não fornecida',
          }, 400);
        }

        const options = {
          quality: body.quality || 85,
          width: body.width,
          height: body.height,
          format: body.format || 'webp',
        };

        console.log(`⚙️ Optimizing image: ${key} by ${user.name}`);

        const optimizedImage = await this.imageUploadService.optimizeExistingImage(key, options);

        if (optimizedImage) {
          return c.json({
            success: true,
            message: 'Imagem otimizada com sucesso',
            data: optimizedImage,
          });
        } else {
          return c.json({
            success: false,
            error: 'Falha ao otimizar imagem',
          }, 500);
        }

      } catch (error) {
        console.error('Error optimizing image:', error);
        return c.json({
          success: false,
          error: 'Erro ao otimizar imagem',
        }, 500);
      }
    });

    // Limpeza de imagens antigas (endpoint para cron jobs)
    this.app.post('/cleanup', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        if (user.role !== 'admin') {
          return c.json({
            success: false,
            error: 'Apenas administradores podem executar limpeza',
          }, 403);
        }

        const folder = c.req.query('folder') || 'temp';
        const days = parseInt(c.req.query('days') || '7');

        console.log(`🧹 Starting cleanup of ${folder}/ older than ${days} days by admin ${user.name}`);

        const result = await this.imageUploadService.cleanupOldImages(folder, days);

        return c.json({
          success: true,
          message: `Limpeza concluída: ${result.deleted} imagens removidas`,
          data: result,
        });

      } catch (error) {
        console.error('Error in cleanup:', error);
        return c.json({
          success: false,
          error: 'Erro na limpeza',
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