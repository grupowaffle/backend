import { Env } from '../config/types/common';
import { HealthStatus, UserCreationResult, DebugInfo } from '../config/types/health';
import { HealthRepository } from '../repositories/healthRepository';
import { healthCheck } from '../config/db';

export class HealthService {
  static async checkHealth(env: Env): Promise<HealthStatus> {
    try {
      // CRÍTICO: Health check do banco de dados primeiro
      const dbHealth = await healthCheck(env);
      
      if (dbHealth.status === 'unhealthy') {
        return {
          status: 'error',
          message: 'Database connection failed',
          error: dbHealth.error,
          timestamp: new Date().toISOString(),
          database: dbHealth.connectionType,
          connection: 'failed',
        };
      }

      const repository = new HealthRepository(env);
      const userCount = await repository.getUserCount();
      const databaseType = repository.getDatabaseType();
      
      return {
        status: 'ok',
        message: 'Serviço saudável com Drizzle ORM',
        timestamp: new Date().toISOString(),
        database: databaseType,
        connection: 'ok',
        userCount,
        hasNeonUrl: repository.hasNeonUrl(),
        hasDatabaseUrl: repository.hasDatabaseUrl(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erro de conexão com o banco de dados',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  static async createTestUser(env: Env): Promise<UserCreationResult> {
    try {
      const repository = new HealthRepository(env);
      const user = await repository.createTestUser();
      const totalUsers = await repository.getUserCount();
      const databaseType = repository.getDatabaseType();

      return {
        status: 'ok',
        message: 'Usuário criado com sucesso usando Drizzle',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        totalUsers,
        database: databaseType,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Falha ao criar usuário',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }

  static async getDebugInfo(env: Env): Promise<DebugInfo> {
    try {
      const repository = new HealthRepository(env);
      
      return {
        status: 'debug',
        message: 'Variáveis de ambiente - Drizzle ORM',
        hasDatabaseUrl: repository.hasDatabaseUrl(),
        hasNeonUrl: repository.hasNeonUrl(),
        databaseUrlLength: repository.getDatabaseUrlLength(),
        neonUrlLength: repository.getNeonUrlLength(),
        databaseType: repository.getDatabaseType(),
        orm: 'drizzle',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: 'Erro ao acessar variáveis',
        hasDatabaseUrl: false,
        hasNeonUrl: false,
        databaseUrlLength: 0,
        neonUrlLength: 0,
        databaseType: 'unknown',
        orm: 'drizzle',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}