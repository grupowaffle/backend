import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ultraCacheMiddleware } from '../middlewares/ultraCacheMiddleware';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';

// Tipos e handlers
import { Env, UserData } from '../config/types/common';
/**
 * Tipo da aplicação Hono com bindings e variáveis personalizadas
 * @typedef {Hono} AppType
 * @property {Env} Bindings - Variáveis de ambiente da aplicação
 * @property {{user: UserData}} Variables - Variáveis de contexto, incluindo dados do usuário
 */
export type AppType = Hono<{
  Bindings: Env;
  Variables: {
    user: UserData;
  };
}>;

/**
 * Cria e configura uma nova instância da aplicação Hono ULTRA-OTIMIZADA
 * @param {Env} env - Objeto contendo as variáveis de ambiente
 * @returns {AppType} Instância configurada da aplicação Hono
 */
export function createApp(_env: Env): AppType {
  const app = new Hono<{
    Bindings: Env;
    Variables: {
      user: UserData;
    };
  }>();
  // Middlewares globais
  app.use('*', cors());
  app.use('*', ultraCacheMiddleware);

  app.route('/health', healthRoutes());
  app.route('/auth', authRoutes());

  return app;
}