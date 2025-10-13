import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { CalendarService } from '../../services/CalendarService';
import { Env } from '../../config/types/common';

export class CalendarController {
  public app: Hono;
  private calendarService: CalendarService;

  constructor(env: Env) {
    this.app = new Hono();
    this.calendarService = new CalendarService(env);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Listar newsletters disponíveis
    this.app.get('/newsletters', async (c) => {
      try {
        const newsletters = await this.calendarService.getNewsletters();

        return c.json({
          success: true,
          data: newsletters
        });
      } catch (error) {
        console.error('❌ Erro ao listar newsletters:', error);
        return c.json({ success: false, error: `Erro ao listar newsletters: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
      }
    });

    // Listar categorias disponíveis
    this.app.get('/categories', async (c) => {
      try {
        const categories = await this.calendarService.getCategories();

        return c.json({
          success: true,
          data: categories
        });
      } catch (error) {
        console.error('❌ Erro ao listar categorias:', error);
        return c.json({ success: false, error: `Erro ao listar categorias: ${error instanceof Error ? error.message : 'Unknown error'}` }, 500);
      }
    });

    // Criar evento
    this.app.post('/', zValidator('json', z.object({
      title: z.string().min(1, 'Título é obrigatório'),
      description: z.string().optional(),
      category: z.string().default('custom'),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
      eventTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Hora deve estar no formato HH:MM ou HH:MM:SS').optional(),
      isAllDay: z.boolean().default(false),
      reminderMinutes: z.number().int().min(0).default(0),
      isRecurring: z.boolean().default(false),
      recurrencePattern: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
      status: z.enum(['active', 'completed', 'cancelled']).default('active'),
      newsletters: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      location: z.string().optional(),
      relevance: z.string().optional()
    })), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const eventData = c.req.valid('json');
        console.log('📅 [CALENDAR CONTROLLER] Dados recebidos:', eventData);
        
        const newEvent = await this.calendarService.createEvent({
          ...eventData,
          userId: String(user.id)
        });

        return c.json({
          success: true,
          data: newEvent,
          message: 'Evento criado com sucesso'
        });
      } catch (error) {
        console.error('Erro ao criar evento:', error);
        return c.json({
          success: false,
          error: `Erro ao criar evento: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar eventos de hoje (DEVE vir ANTES de /:id)
    this.app.get('/today', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const events = await this.calendarService.getTodayEvents();

        return c.json({
          success: true,
          data: events,
          count: events.length,
          date: new Date().toISOString().split('T')[0]
        });
      } catch (error) {
        console.error('Erro ao buscar eventos de hoje:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos de hoje: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar próximos eventos (DEVE vir ANTES de /:id)
    this.app.get('/upcoming/:days?', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const days = parseInt(c.req.param('days') || '7');
        const events = await this.calendarService.getUpcomingEvents(days);

        return c.json({
          success: true,
          data: events,
          count: events.length,
          days
        });
      } catch (error) {
        console.error('Erro ao buscar próximos eventos:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar próximos eventos: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar evento por ID (DEVE vir DEPOIS das rotas específicas)
    this.app.get('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const eventId = c.req.param('id');
        const event = await this.calendarService.getEventById(eventId);

        if (!event) {
          return c.json({ success: false, error: 'Evento não encontrado' }, 404);
        }

        // Eventos são compartilhados - qualquer usuário autenticado pode ver
        return c.json({
          success: true,
          data: event
        });
      } catch (error) {
        console.error('Erro ao buscar evento:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar evento: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar todos os eventos (compartilhados entre todos os usuários)
    this.app.get('/', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        console.log('📅 [CALENDAR CONTROLLER] Buscando todos os eventos...');
        const events = await this.calendarService.getAllEvents();
        console.log('📅 [CALENDAR CONTROLLER] Eventos retornados:', events.length);

        return c.json({
          success: true,
          data: events,
          count: events.length
        });
      } catch (error) {
        console.error('❌ [CALENDAR CONTROLLER] Erro ao buscar eventos:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar eventos por período
    this.app.get('/range/:startDate/:endDate', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const startDate = c.req.param('startDate');
        const endDate = c.req.param('endDate');

        // Validar formato das datas
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
          return c.json({ success: false, error: 'Formato de data inválido. Use YYYY-MM-DD' }, 400);
        }

        const events = await this.calendarService.getEventsByDateRange(String(user.id), startDate, endDate);

        return c.json({
          success: true,
          data: events,
          count: events.length,
          period: { startDate, endDate }
        });
      } catch (error) {
        console.error('Erro ao buscar eventos por período:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos por período: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar eventos da semana (editorial)
    this.app.get('/weekly/:weekStart', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const weekStart = c.req.param('weekStart');

        // Validar formato da data
        if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
          return c.json({ success: false, error: 'Formato de data inválido. Use YYYY-MM-DD' }, 400);
        }

        const events = await this.calendarService.getWeeklyEditorialEvents(String(user.id), weekStart);

        return c.json({
          success: true,
          data: events,
          count: events.length,
          weekStart
        });
      } catch (error) {
        console.error('Erro ao buscar eventos da semana:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos da semana: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar eventos por categoria (editorial)
    this.app.get('/category/:category', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const category = c.req.param('category');
        const events = await this.calendarService.getEditorialEventsByCategory(String(user.id), category);

        return c.json({
          success: true,
          data: events,
          count: events.length,
          category
        });
      } catch (error) {
        console.error('Erro ao buscar eventos por categoria:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos por categoria: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Atualizar evento
    this.app.put('/:id', zValidator('json', z.object({
      title: z.string().min(1).optional(),
      description: z.string().optional(),
      category: z.string().optional(),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      eventTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
      isAllDay: z.boolean().optional(),
      reminderMinutes: z.number().int().min(0).optional(),
      isRecurring: z.boolean().optional(),
      recurrencePattern: z.string().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['active', 'completed', 'cancelled']).optional(),
      newsletters: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
      location: z.string().optional(),
      relevance: z.string().optional()
    })), async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const eventId = c.req.param('id');
        const eventData = c.req.valid('json');

        // Verificar se o evento existe
        const existingEvent = await this.calendarService.getEventById(eventId);
        if (!existingEvent) {
          return c.json({ success: false, error: 'Evento não encontrado' }, 404);
        }

        // Eventos são compartilhados - qualquer usuário autenticado pode editar

        const updatedEvent = await this.calendarService.updateEvent(eventId, eventData);

        if (!updatedEvent) {
          return c.json({ success: false, error: 'Erro ao atualizar evento' }, 500);
        }

        return c.json({
          success: true,
          data: updatedEvent,
          message: 'Evento atualizado com sucesso'
        });
      } catch (error) {
        console.error('Erro ao atualizar evento:', error);
        return c.json({
          success: false,
          error: `Erro ao atualizar evento: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Deletar evento
    this.app.delete('/:id', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const eventId = c.req.param('id');

        // Verificar se o evento existe
        const existingEvent = await this.calendarService.getEventById(eventId);
        if (!existingEvent) {
          return c.json({ success: false, error: 'Evento não encontrado' }, 404);
        }

        // Eventos são compartilhados - qualquer usuário autenticado pode deletar

        await this.calendarService.deleteEvent(eventId);

        return c.json({
          success: true,
          message: 'Evento deletado com sucesso'
        });
      } catch (error) {
        console.error('Erro ao deletar evento:', error);
        return c.json({
          success: false,
          error: `Erro ao deletar evento: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar eventos por status
    this.app.get('/status/:status', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const status = c.req.param('status');
        const events = await this.calendarService.getEventsByStatus(String(user.id), status);

        return c.json({
          success: true,
          data: events,
          count: events.length,
          status
        });
      } catch (error) {
        console.error('Erro ao buscar eventos por status:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos por status: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });

    // Buscar eventos por prioridade
    this.app.get('/priority/:priority', async (c) => {
      try {
        const user = c.get('user');
        if (!user) {
          return c.json({ success: false, error: 'Usuário não autenticado' }, 401);
        }

        const priority = c.req.param('priority');
        const events = await this.calendarService.getEventsByPriority(String(user.id), priority);

        return c.json({
          success: true,
          data: events,
          count: events.length,
          priority
        });
      } catch (error) {
        console.error('Erro ao buscar eventos por prioridade:', error);
        return c.json({
          success: false,
          error: `Erro ao buscar eventos por prioridade: ${error instanceof Error ? error.message : 'Unknown error'}`
        }, 500);
      }
    });
  }

  getApp() {
    return this.app;
  }
}
