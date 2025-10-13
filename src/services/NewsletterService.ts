import { getDrizzleClient } from '../config/db';
import { newsletters } from '../config/db/schema/newsletters';
import { eq, desc } from 'drizzle-orm';
import { Env } from '../config/types/common';

export interface Newsletter {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNewsletterRequest {
  name: string;
  description: string;
  isActive?: boolean;
}

export interface UpdateNewsletterRequest {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export class NewsletterService {
  private db: ReturnType<typeof getDrizzleClient>;

  constructor(env: Env) {
    this.db = getDrizzleClient(env);
  }

  // Criar nova newsletter
  async createNewsletter(data: CreateNewsletterRequest): Promise<Newsletter> {
    try {
      console.log('📰 [NEWSLETTER SERVICE] Criando newsletter:', data.name);
      
      const [newsletter] = await this.db
        .insert(newsletters)
        .values({
          name: data.name,
          description: data.description,
          isActive: data.isActive ?? true,
        })
        .returning();

      console.log('✅ [NEWSLETTER SERVICE] Newsletter criada:', newsletter.id);
      return newsletter;
    } catch (error) {
      console.error('❌ [NEWSLETTER SERVICE] Erro ao criar newsletter:', error);
      throw error;
    }
  }

  // Buscar todas as newsletters
  async getNewsletters(): Promise<Newsletter[]> {
    try {
      console.log('📰 [NEWSLETTER SERVICE] Buscando newsletters...');
      
      const newslettersList = await this.db
        .select()
        .from(newsletters)
        .orderBy(desc(newsletters.createdAt));

      console.log(`✅ [NEWSLETTER SERVICE] Encontradas ${newslettersList.length} newsletters`);
      return newslettersList;
    } catch (error) {
      console.error('❌ [NEWSLETTER SERVICE] Erro ao buscar newsletters:', error);
      throw error;
    }
  }

  // Buscar newsletter por ID
  async getNewsletterById(id: string): Promise<Newsletter | null> {
    try {
      console.log('📰 [NEWSLETTER SERVICE] Buscando newsletter por ID:', id);
      
      const [newsletter] = await this.db
        .select()
        .from(newsletters)
        .where(eq(newsletters.id, id))
        .limit(1);

      if (!newsletter) {
        console.log('❌ [NEWSLETTER SERVICE] Newsletter não encontrada');
        return null;
      }

      console.log('✅ [NEWSLETTER SERVICE] Newsletter encontrada:', newsletter.name);
      return newsletter;
    } catch (error) {
      console.error('❌ [NEWSLETTER SERVICE] Erro ao buscar newsletter:', error);
      throw error;
    }
  }

  // Atualizar newsletter
  async updateNewsletter(id: string, data: UpdateNewsletterRequest): Promise<Newsletter> {
    try {
      console.log('📰 [NEWSLETTER SERVICE] Atualizando newsletter:', id);
      
      const [newsletter] = await this.db
        .update(newsletters)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(newsletters.id, id))
        .returning();

      if (!newsletter) {
        throw new Error('Newsletter não encontrada');
      }

      console.log('✅ [NEWSLETTER SERVICE] Newsletter atualizada:', newsletter.name);
      return newsletter;
    } catch (error) {
      console.error('❌ [NEWSLETTER SERVICE] Erro ao atualizar newsletter:', error);
      throw error;
    }
  }

  // Deletar newsletter
  async deleteNewsletter(id: string): Promise<boolean> {
    try {
      console.log('📰 [NEWSLETTER SERVICE] Deletando newsletter:', id);
      
      const result = await this.db
        .delete(newsletters)
        .where(eq(newsletters.id, id));

      console.log('✅ [NEWSLETTER SERVICE] Newsletter deletada');
      return true;
    } catch (error) {
      console.error('❌ [NEWSLETTER SERVICE] Erro ao deletar newsletter:', error);
      throw error;
    }
  }

  // Buscar newsletters ativas (para uso em artigos e calendário)
  async getActiveNewsletters(): Promise<Newsletter[]> {
    try {
      console.log('📰 [NEWSLETTER SERVICE] Buscando newsletters ativas...');
      
      const newslettersList = await this.db
        .select()
        .from(newsletters)
        .where(eq(newsletters.isActive, true))
        .orderBy(desc(newsletters.createdAt));

      console.log(`✅ [NEWSLETTER SERVICE] Encontradas ${newslettersList.length} newsletters ativas`);
      return newslettersList;
    } catch (error) {
      console.error('❌ [NEWSLETTER SERVICE] Erro ao buscar newsletters ativas:', error);
      throw error;
    }
  }
}
