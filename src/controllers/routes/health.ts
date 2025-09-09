import { Hono } from 'hono';
import { Env } from '../../config/types/common';
import { HealthHandlers } from '../handlers/healthHandlers';

/**
 * Tipo que define a estrutura do router de health check
 */
type HealthRouter = Hono<{
  Bindings: Env;
}>;

/**
 * Configura e exporta as rotas de health check (saúde da aplicação)
 * @returns Router configurado com as rotas de health check
 */
export function healthRoutes(): HealthRouter {
  const router = new Hono<{
    Bindings: Env;
  }>();

  /**
   * Rota principal de health check
   * Retorna status 200 e informações básicas de saúde
   */
  router.get('/', HealthHandlers.getHealth);

  /**
   * Rota para testar criação de usuário (como no exemplo)
   */
  router.get('/test-user', HealthHandlers.createTestUser);

  /**
   * Rota para debug das variáveis de ambiente
   */
  router.get('/debug', HealthHandlers.getDebugInfo);

  return router;
}