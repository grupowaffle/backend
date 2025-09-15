/**
 * Versão com integração R2 completa
 */
import { Hono } from 'hono';
import { generateId } from './lib/cuid';
import { getDrizzleClient } from './config/db';
import { mediaFiles } from './config/db/schema';

/**
 * Exporta o objeto principal que será usado como handler das requisições
 */
export default {
  /**
   * Função fetch com R2 integrado
   */
  fetch: async (request: Request, env: any, ctx: ExecutionContext) => {
    const app = new Hono();
    
    app.get('/', (c) => {
      return c.json({
        message: 'The News CMS API - R2 Ready!',
        version: '1.0.0',
        status: 'working',
        timestamp: new Date().toISOString(),
        r2Available: {
          FILE_STORAGE: !!env.FILE_STORAGE,
          ASSETS: !!env.ASSETS
        }
      });
    });

    // Health check endpoint (conforme documentação Postman)
    app.get('/health', (c) => {
      return c.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
          api: 'operational',
          r2: {
            FILE_STORAGE: !!env.FILE_STORAGE,
            ASSETS: !!env.ASSETS
          }
        }
      });
    });

    // Upload endpoint
    app.post('/api/media/upload', async (c) => {
      try {
        if (!env.FILE_STORAGE) {
          return c.json({ error: 'FILE_STORAGE não configurado' }, 500);
        }

        const formData = await c.req.formData();
        const file = formData.get('file') as File;

        if (!file) {
          return c.json({ error: 'Arquivo não fornecido' }, 400);
        }

        // Upload para R2
        const key = `uploads/${Date.now()}-${file.name}`;
        await env.FILE_STORAGE.put(key, file.stream(), {
          httpMetadata: { contentType: file.type }
        });

        // Salvar no banco (opcional para este teste)
        try {
          const db = getDrizzleClient(env);
          const record = await db.insert(mediaFiles).values({
            id: generateId(),
            fileName: file.name,
            originalFileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            r2Key: key,
            r2Url: `/api/media/serve/${key}`,
            internalUrl: `/api/media/serve/${key}`,
            module: 'general',
            uploadedBy: 'test-user',
            tags: [],
            metadata: {},
            isActive: true,
          }).returning();

          return c.json({
            success: true,
            data: {
              id: record[0].id,
              url: `/api/media/serve/${key}`,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            }
          });
        } catch (dbError) {
          // Se banco falhar, ainda retorna sucesso do upload R2
          return c.json({
            success: true,
            data: {
              url: `/api/media/serve/${key}`,
              fileName: file.name,
              fileType: file.type,
              fileSize: file.size,
            },
            note: 'Arquivo enviado para R2, banco indisponível'
          });
        }

      } catch (error) {
        return c.json({ 
          error: error instanceof Error ? error.message : 'Erro no upload'
        }, 500);
      }
    });

    // Serve endpoint
    app.get('/api/media/serve/*', async (c) => {
      try {
        const fileKey = c.req.param('*');
        
        if (!env.FILE_STORAGE) {
          return c.json({ error: 'FILE_STORAGE não configurado' }, 500);
        }

        const file = await env.FILE_STORAGE.get(fileKey);
        
        if (!file) {
          return c.json({ error: 'Arquivo não encontrado' }, 404);
        }

        const headers = new Headers();
        headers.set('Content-Type', file.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Cache-Control', 'public, max-age=31536000');
        
        if (file.size) {
          headers.set('Content-Length', file.size.toString());
        }

        return new Response(file.body, { headers });

      } catch (error) {
        return c.json({ 
          error: error instanceof Error ? error.message : 'Erro ao servir arquivo'
        }, 500);
      }
    });

    // List endpoint
    app.get('/api/media/list', async (c) => {
      try {
        if (!env.FILE_STORAGE) {
          return c.json({ error: 'FILE_STORAGE não configurado' }, 500);
        }

        const list = await env.FILE_STORAGE.list({ limit: 50 });
        
        return c.json({
          success: true,
          data: {
            files: list.objects.map(obj => ({
              key: obj.key,
              url: `/api/media/serve/${obj.key}`,
              size: obj.size,
              uploaded: obj.uploaded
            }))
          }
        });

      } catch (error) {
        return c.json({ 
          error: error instanceof Error ? error.message : 'Erro ao listar arquivos'
        }, 500);
      }
    });

    // Health check
    app.get('/api/media/health', async (c) => {
      try {
        if (!env.FILE_STORAGE) {
          return c.json({ 
            success: false, 
            error: 'FILE_STORAGE não configurado' 
          }, 500);
        }

        await env.FILE_STORAGE.list({ limit: 1 });
        
        return c.json({
          success: true,
          message: 'R2 funcionando',
          bindings: {
            FILE_STORAGE: !!env.FILE_STORAGE,
            ASSETS: !!env.ASSETS
          }
        });

      } catch (error) {
        return c.json({ 
          success: false,
          error: error instanceof Error ? error.message : 'Erro R2'
        }, 500);
      }
    });

    return app.fetch(request, env, ctx);
  }
} satisfies ExportedHandler;