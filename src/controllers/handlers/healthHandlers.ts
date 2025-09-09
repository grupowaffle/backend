import { Context } from 'hono';
import { Env } from '../../config/types/common';
import { HealthService } from '../../services/healthService';

export class HealthHandlers {
  static async getHealth(c: Context) {
    const currentEnv = c.env as Env;
    const result = await HealthService.checkHealth(currentEnv);
    
    const statusCode = result.status === 'ok' ? 200 : 503;
    return c.json(result, statusCode);
  }

  static async createTestUser(c: Context) {
    const currentEnv = c.env as Env;
    const result = await HealthService.createTestUser(currentEnv);
    
    const statusCode = result.status === 'ok' ? 200 : 500;
    return c.json(result, statusCode);
  }

  static async getDebugInfo(c: Context) {
    const currentEnv = c.env as Env;
    const result = await HealthService.getDebugInfo(currentEnv);
    
    const statusCode = result.status === 'debug' ? 200 : 500;
    return c.json(result, statusCode);
  }
}