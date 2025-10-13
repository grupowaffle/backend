import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { NewsletterService } from '../../services/NewsletterService';
import { Env } from '../../config/types/common';

// Schemas de validação
const createNewsletterSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  isActive: z.boolean().optional(),
});

const updateNewsletterSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo').optional(),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  isActive: z.boolean().optional(),
});

export class NewsletterController {
  public app: Hono;
  private newsletterService: NewsletterService;

  constructor(env: Env) {
    this.app = new Hono();
    this.newsletterService = new NewsletterService(env);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Listar todas as newsletters
    this.app.get('/', async (c) => {
      try {
        const newsletters = await this.newsletterService.getNewsletters();

        return c.json({
          success: true,
          data: newsletters,
          total: newsletters.length
        });
      } catch (error) {
        console.error('❌ Erro ao listar newsletters:', error);
        return c.json({
          success: false,
          error: `Erro ao listar newsletters: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Listar newsletters ativas (para uso em artigos e calendário)
    this.app.get('/active', async (c) => {
      try {
        const newsletters = await this.newsletterService.getActiveNewsletters();

        return c.json({
          success: true,
          data: newsletters,
          total: newsletters.length
        });
      } catch (error) {
        console.error('❌ Erro ao listar newsletters ativas:', error);
        return c.json({
          success: false,
          error: `Erro ao listar newsletters ativas: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar newsletter por ID
    this.app.get('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        const newsletter = await this.newsletterService.getNewsletterById(id);

        if (!newsletter) {
          return c.json({
            success: false,
            error: 'Newsletter não encontrada'
          }, 404);
        }

        return c.json({
          success: true,
          data: newsletter
        });
      } catch (error) {
        console.error('❌ Erro ao buscar newsletter:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar newsletter: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Criar nova newsletter
    this.app.post('/', zValidator('json', createNewsletterSchema), async (c) => {
      try {
        const data = c.req.valid('json');
        const newsletter = await this.newsletterService.createNewsletter(data);

        return c.json({
          success: true,
          data: newsletter
        }, 201);
      } catch (error) {
        console.error('❌ Erro ao criar newsletter:', error);
        return c.json({
          success: false,
          error: `Erro ao criar newsletter: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Atualizar newsletter
    this.app.put('/:id', zValidator('json', updateNewsletterSchema), async (c) => {
      try {
        const id = c.req.param('id');
        const data = c.req.valid('json');
        
        const newsletter = await this.newsletterService.updateNewsletter(id, data);

        return c.json({
          success: true,
          data: newsletter
        });
      } catch (error) {
        console.error('❌ Erro ao atualizar newsletter:', error);
        return c.json({
          success: false,
          error: `Erro ao atualizar newsletter: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Deletar newsletter
    this.app.delete('/:id', async (c) => {
      try {
        const id = c.req.param('id');
        await this.newsletterService.deleteNewsletter(id);

        return c.json({
          success: true,
          message: 'Newsletter deletada com sucesso'
        });
      } catch (error) {
        console.error('❌ Erro ao deletar newsletter:', error);
        return c.json({
          success: false,
          error: `Erro ao deletar newsletter: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });
  }

  getApp() {
    return this.app;
  }
}
