import { Context, Next } from 'hono';
import { Env } from '../config/types/common';

/**
 * Middleware ANTI-CACHE para rotas administrativas
 * 
 * GARANTE que rotas do CMS, Auth e Admin NUNCA tenham cache
 * Aplicado ANTES do middleware de cache para sobrescrever qualquer configuração
 */
export const noCacheMiddleware = async (c: Context<{ Bindings: Env }>, next: Next) => {
  const path = c.req.path;
  
  // Rotas que NUNCA devem ter cache (administração)
  const noCacheRoutes = [
    '/api/cms/',
    '/api/auth/',
    '/api/admin/',
  ];

  // Verifica se é uma rota que não deve ter cache
  const shouldDisableCache = noCacheRoutes.some(route => path.startsWith(route));
  
  if (shouldDisableCache) {
    // Headers ANTI-CACHE mais agressivos possíveis
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate, private, max-age=0');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    c.header('Last-Modified', new Date().toUTCString());
    c.header('ETag', `"${Date.now()}"`);
    c.header('X-Cache', 'DISABLED');
    c.header('X-Cache-Status', 'BYPASS');
    c.header('X-No-Cache', 'true');
    
    // Headers adicionais para garantir que não haja cache
    c.header('Vary', '*');
    c.header('X-Accel-Expires', '0');
  }
  
  await next();
};
