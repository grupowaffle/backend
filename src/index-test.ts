/**
 * Versão de teste mínima
 */
import { Hono } from 'hono';

export default {
  fetch: async (request: Request, env: any) => {
    const app = new Hono();
    
    app.get('/', (c) => {
      return c.json({
        message: 'API Working',
        status: 'ok',
        r2: {
          FILE_STORAGE: !!env.FILE_STORAGE,
          ASSETS: !!env.ASSETS
        }
      });
    });

    app.get('/test', (c) => {
      return c.json({ test: 'working' });
    });

    return app.fetch(request, env);
  }
};