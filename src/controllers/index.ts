import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ultraCacheMiddleware } from '../middlewares/ultraCacheMiddleware';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { createCMSRoutes } from './cms';
import { createPublicRoutes } from './public';
import { errorHandler } from '../middleware/errorHandler';
import { apiRateLimit } from '../middleware/rateLimit';

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
export function createApp(env: Env): AppType {
  const app = new Hono<{
    Bindings: Env;
    Variables: {
      user: UserData;
    };
  }>();

  // Middlewares globais
  app.use('*', cors());
  app.use('*', errorHandler); // Add error handler early
  app.use('*', ultraCacheMiddleware);
  
  // Apply rate limiting to public API
  app.use('/api/public/*', apiRateLimit);

  // Mount routes  
  app.route('/health', healthRoutes());
  app.route('/auth', authRoutes());
  app.route('/api/cms', createCMSRoutes(env));
  app.route('/api/public', createPublicRoutes(env));

  // Root route
  app.get('/', (c) => {
    return c.json({
      message: 'The News CMS API',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        auth: '/auth',
        cms: '/api/cms',
        articles: '/api/cms/articles',
        categories: '/api/cms/categories',
        beehiiv: '/api/cms/beehiiv',
        media: '/api/cms/media',
        'public-api': '/api/public',
      },
    });
  });

  return app;
}