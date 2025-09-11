import { Hono } from 'hono';
import { Env, UserData } from '../../config/types/common';
import { HealthHandlers } from '../../handlers/healthHandlers';
import { roleMiddleware, authMiddleware } from '../../middlewares/auth';

/**
 * Tipo que define a estrutura do router de health check
 */
type HealthRouter = Hono<{
  Bindings: Env;
  Variables: {
    user: UserData;
  };
}>;

/**
 * Configura e exporta as rotas de health check (saúde da aplicação)
 * @returns Router configurado com as rotas de health check
 */
export function healthRoutes(): HealthRouter {
  const router = new Hono<{
    Bindings: Env;
    Variables: {
      user: UserData;
    };
  }>();

  /**
   * Rota principal de health check
   * Retorna status 200 e informações básicas de saúde
   */
  router.get('/', HealthHandlers.getHealth);

  /**
   * Rota para debug das variáveis de ambiente
   */
  router.get('/debug', authMiddleware, roleMiddleware(['admin']), HealthHandlers.getDebugInfo);

  return router;
}