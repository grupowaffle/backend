import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import { getDrizzleClient } from '../config/db';
import { calendarEvents, categories, type CalendarEvent, type NewCalendarEvent } from '../config/db/schema';
import { newsletters } from '../config/db/schema/newsletters';
import { Env } from '../config/types/common';

export class CalendarService {
  private db: ReturnType<typeof getDrizzleClient>;

  constructor(env: Env) {
    this.db = getDrizzleClient(env);
  }

  // Função auxiliar para processar campos JSON dos eventos
  private processEvent(event: any): CalendarEvent {
    return {
      ...event,
      newsletters: this.parseJsonField(event.newsletters),
      categories: this.parseJsonField(event.categories)
    };
  }

  // Função auxiliar para fazer parse seguro de campos JSON
  private parseJsonField(field: any): string[] {
    if (!field) return [];
    if (Array.isArray(field)) return field;
    if (typeof field === 'string') {
      try {
        return JSON.parse(field);
      } catch {
        return [];
      }
    }
    return [];
  }

  // Função auxiliar para processar arrays de eventos
  private processEvents(events: any[]): CalendarEvent[] {
    return events.map(event => this.processEvent(event));
  }

  // Criar novo evento
  async createEvent(eventData: NewCalendarEvent): Promise<CalendarEvent> {
    try {
      console.log('📅 [CALENDAR SERVICE] Criando evento:', eventData);
      
      // Processar newsletters e categorias se fornecidas
      const processedData = {
        ...eventData,
        newsletters: eventData.newsletters ? JSON.stringify(eventData.newsletters) : null,
        categories: eventData.categories ? JSON.stringify(eventData.categories) : null
      };
      
      const [newEvent] = await this.db.insert(calendarEvents).values(processedData).returning();
      
      console.log('✅ [CALENDAR SERVICE] Evento criado com sucesso:', newEvent.id);
      return newEvent;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao criar evento:', error);
      throw error;
    }
  }

  // Buscar evento por ID
  async getEventById(eventId: string): Promise<CalendarEvent | null> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando evento:', eventId);
      
      const [event] = await this.db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.id, eventId))
        .limit(1);
      
      if (!event) return null;
      
      return this.processEvent(event);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar evento:', error);
      throw error;
    }
  }

  // Buscar todos os eventos (compartilhados entre todos os usuários)
  async getAllEvents(): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando todos os eventos...');
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .orderBy(desc(calendarEvents.eventDate), desc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos`);
      
      const processedEvents = this.processEvents(events);
      
      return processedEvents;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar todos os eventos:', error);
      throw error;
    }
  }

  // Buscar eventos do usuário
  async getUserEvents(userId: string): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos do usuário:', userId);
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.userId, userId))
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos`);
      console.log('📅 [CALENDAR SERVICE] Primeiro evento (antes do processamento):', events[0]);
      
      const processedEvents = this.processEvents(events);
      console.log('📅 [CALENDAR SERVICE] Primeiro evento (após processamento):', processedEvents[0]);
      
      return processedEvents;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos do usuário:', error);
      throw error;
    }
  }

  // Buscar eventos por período
  async getEventsByDateRange(
    userId: string, 
    startDate: string, 
    endDate: string
  ): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos por período:', { userId, startDate, endDate });
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.eventDate, startDate),
            lte(calendarEvents.eventDate, endDate)
          )
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos no período`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos por período:', error);
      throw error;
    }
  }

  // Buscar eventos da semana (editorial)
  async getWeeklyEditorialEvents(userId: string, weekStart: string): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos da semana editorial:', { userId, weekStart });
      
      // Calcular fim da semana (6 dias depois)
      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
      const weekEnd = weekEndDate.toISOString().split('T')[0];
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            gte(calendarEvents.eventDate, weekStart),
            lte(calendarEvents.eventDate, weekEnd)
          )
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos da semana`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos da semana:', error);
      throw error;
    }
  }

  // Buscar eventos por categoria (editorial)
  async getEditorialEventsByCategory(
    userId: string, 
    category: string
  ): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos por categoria:', { userId, category });
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            eq(calendarEvents.category, category)
          )
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos da categoria ${category}`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos por categoria:', error);
      throw error;
    }
  }

  // Buscar próximos eventos (para notificações)
  async getUpcomingEvents(days: number = 7): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando próximos eventos (compartilhados):', { days });
      
      const today = new Date().toISOString().split('T')[0];
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);
      const futureDateStr = futureDate.toISOString().split('T')[0];
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            gte(calendarEvents.eventDate, today),
            lte(calendarEvents.eventDate, futureDateStr),
            eq(calendarEvents.status, 'active')
          )
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} próximos eventos`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar próximos eventos:', error);
      throw error;
    }
  }

  // Atualizar evento
  async updateEvent(eventId: string, eventData: Partial<NewCalendarEvent>): Promise<CalendarEvent | null> {
    try {
      console.log('📅 [CALENDAR SERVICE] Atualizando evento:', { eventId, eventData });
      
      // Processar newsletters se fornecidas
      const processedData = {
        ...eventData,
        newsletters: eventData.newsletters ? JSON.stringify(eventData.newsletters) : eventData.newsletters,
        updatedAt: new Date()
      };
      
      const [updatedEvent] = await this.db
        .update(calendarEvents)
        .set(processedData)
        .where(eq(calendarEvents.id, eventId))
        .returning();
      
      if (updatedEvent) {
        console.log('✅ [CALENDAR SERVICE] Evento atualizado com sucesso:', updatedEvent.id);
      }
      
      return updatedEvent || null;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao atualizar evento:', error);
      throw error;
    }
  }

  // Deletar evento
  async deleteEvent(eventId: string): Promise<boolean> {
    try {
      console.log('📅 [CALENDAR SERVICE] Deletando evento:', eventId);
      
      const result = await this.db
        .delete(calendarEvents)
        .where(eq(calendarEvents.id, eventId));
      
      console.log('✅ [CALENDAR SERVICE] Evento deletado com sucesso');
      return true;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao deletar evento:', error);
      throw error;
    }
  }

  // Buscar eventos por status
  async getEventsByStatus(userId: string, status: string): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos por status:', { userId, status });
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            eq(calendarEvents.status, status)
          )
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos com status ${status}`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos por status:', error);
      throw error;
    }
  }

  // Buscar eventos por prioridade
  async getEventsByPriority(userId: string, priority: string): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos por prioridade:', { userId, priority });
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            eq(calendarEvents.priority, priority)
          )
        )
        .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos com prioridade ${priority}`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos por prioridade:', error);
      throw error;
    }
  }

  // Buscar eventos do dia (para notificações)
  async getTodayEvents(): Promise<CalendarEvent[]> {
    try {
      console.log('📅 [CALENDAR SERVICE] Buscando eventos de hoje (compartilhados)');
      
      const today = new Date().toISOString().split('T')[0];
      
      const events = await this.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.eventDate, today),
            eq(calendarEvents.status, 'active')
          )
        )
        .orderBy(asc(calendarEvents.eventTime));
      
      console.log(`✅ [CALENDAR SERVICE] Encontrados ${events.length} eventos de hoje`);
      return this.processEvents(events);
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar eventos de hoje:', error);
      throw error;
    }
  }

  // Buscar newsletters disponíveis
  async getNewsletters(): Promise<{ id: string; name: string; description: string }[]> {
    try {
      console.log('📧 [CALENDAR SERVICE] Buscando newsletters disponíveis...');
      
      const newslettersList = await this.db
        .select({
          id: newsletters.id,
          name: newsletters.name,
          description: newsletters.description
        })
        .from(newsletters)
        .where(eq(newsletters.isActive, true))
        .orderBy(asc(newsletters.name));
      
      // Garantir que description não seja null
      const processedNewsletters = newslettersList.map(nl => ({
        ...nl,
        description: nl.description || ''
      }));
      
      console.log(`✅ [CALENDAR SERVICE] Encontradas ${processedNewsletters.length} newsletters`);
      return processedNewsletters;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar newsletters:', error);
      throw error;
    }
  }

  // Buscar categorias disponíveis
  async getCategories(): Promise<{ id: string; name: string; description: string; color: string; icon: string }[]> {
    try {
      console.log('🏷️ [CALENDAR SERVICE] Buscando categorias disponíveis...');
      
      const categoriesList = await this.db
        .select({
          id: categories.id,
          name: categories.name,
          description: categories.description,
          color: categories.color,
          icon: categories.icon
        })
        .from(categories)
        .where(eq(categories.isActive, true))
        .orderBy(asc(categories.name));
      
      console.log(`✅ [CALENDAR SERVICE] Encontradas ${categoriesList.length} categorias`);
      return categoriesList;
    } catch (error) {
      console.error('❌ [CALENDAR SERVICE] Erro ao buscar categorias:', error);
      throw error;
    }
  }
}
