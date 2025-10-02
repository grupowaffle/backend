import { Env } from '../config/types/common';
import { TestUser } from '../config/types/health';
import { getDrizzleClient, getDatabaseType } from '../lib/database';
// Users table removed - using D1 for user management
import { count } from 'drizzle-orm';

export class HealthRepository {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async getUserCount(): Promise<number> {
    const db = getDrizzleClient(this.env);
    const userCountResult = await db.select({ count: count() }).from(users);
    return userCountResult[0]?.count || 0;
  }

  async createTestUser(): Promise<TestUser> {
    const db = getDrizzleClient(this.env);
    
    const now = new Date();
    const newUserData = {
      email: `test${Math.ceil(Math.random() * 1000)}@example.com`,
      name: "Test User",
      role: "user" as const,
      createdAt: now,
      updatedAt: now,
    };

    const [user] = await db.insert(users).values(newUserData).returning();
    return {
      id: parseInt(user.id),
      name: user.name || "Test User",
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
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