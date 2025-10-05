import { Env } from '../config/types/common';
import { TestUser } from '../config/types/health';
import { getDrizzleClient, getDatabaseType } from '../lib/database';
// Users table removed - using D1 for user management
import { count } from 'drizzle-orm';
import { CloudflareD1Client } from '../config/types/auth';

export class HealthRepository {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async getUserCount(): Promise<number> {
    // Usar D1 para contagem de usuários
    const d1Client = new CloudflareD1Client({
      accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
      databaseId: this.env.CLOUDFLARE_D1_DATABASE_ID,
      apiToken: this.env.CLOUDFLARE_API_TOKEN,
    });

    try {
      const result = await d1Client.execute('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
      return result.result?.results?.[0]?.count || 0;
    } catch (error) {
      console.error('Erro ao contar usuários:', error);
      return 0;
    }
  }

  async createTestUser(): Promise<TestUser> {
    // Usar D1 para criação de usuário de teste
    const d1Client = new CloudflareD1Client({
      accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
      databaseId: this.env.CLOUDFLARE_D1_DATABASE_ID,
      apiToken: this.env.CLOUDFLARE_API_TOKEN,
    });

    const now = new Date();
    const testEmail = `test${Math.ceil(Math.random() * 1000)}@example.com`;
    const userId = `test_${Date.now()}`;

    try {
      await d1Client.execute(`
        INSERT INTO users (id, email, display_name, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [userId, testEmail, "Test User", "user", 1, now.toISOString(), now.toISOString()]);

      return {
        id: userId,
        name: "Test User",
        email: testEmail,
        role: "user",
        createdAt: now,
        updatedAt: now,
      };
    } catch (error) {
      console.error('Erro ao criar usuário de teste:', error);
      throw error;
    }
  }

  getDatabaseType(): string {
    return getDatabaseType(this.env);
  }

  hasNeonUrl(): boolean {
    return !!this.env.NEON_URL;
  }

  hasDatabaseUrl(): boolean {
    return !!this.env.DATABASE_URL;
  }

  getDatabaseUrlLength(): number {
    return this.env.DATABASE_URL?.length || 0;
  }

  getNeonUrlLength(): number {
    return this.env.NEON_URL?.length || 0;
  }
}