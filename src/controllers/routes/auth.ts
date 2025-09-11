import { Hono } from 'hono';
import { Env, UserData } from '../../config/types/common';
import { authMiddleware, roleMiddleware } from '../../middlewares/auth';
import { AuthHandlers } from '../../handlers/authHandlers';

export type AuthAppType = Hono<{
  Bindings: Env;
  Variables: {
    user: UserData;
    isMasterAccess: boolean;
  };
}>;

export function authRoutes() {
  const app = new Hono<{
    Bindings: Env;
    Variables: {
      user: UserData;
      isMasterAccess: boolean;
    };
  }>();

  // Login endpoint
  app.post('/login', AuthHandlers.loginHandler);

  // Register endpoint
  app.post('/register', AuthHandlers.registerHandler);

  // Debug endpoint to test D1 connection
  app.get('/debug/d1-test', async (c) => {
    try {
      const env = c.env;
      console.log('Debug: Testing D1 connection...');
      
      const d1Client = new (await import('../../lib/cloudflareD1Client')).CloudflareD1Client({
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
        databaseId: env.CLOUDFLARE_D1_DATABASE_ID,
        apiToken: env.CLOUDFLARE_API_TOKEN,
      });

      // Test simple query
      const result = await d1Client.query('SELECT COUNT(*) as count FROM users');
      
      return c.json({
        success: true,
        d1Connection: result.success,
        userCount: result.result?.results?.[0]?.count || 0,
        error: result.errors
      });
    } catch (error) {
      console.error('Debug D1 test error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create protected routes that require authentication
  const secured = app.use('*', authMiddleware);

  // User profile
  secured.get('/user', AuthHandlers.profileHandler);

  // Update profile
  secured.put('/user/update', AuthHandlers.updateProfileHandler);

  // Change password
  secured.post('/user/change-password', AuthHandlers.updateProfileHandler); // Placeholder

  // Logout
  secured.post('/logout', AuthHandlers.logoutHandler);

  // Rotas de gerenciamento de roles (protegidas e requerem role admin)
  secured.post('/roles/assign', 
    roleMiddleware(['admin', 'super_admin']),
    AuthHandlers.assignRoleHandler
  );

  secured.post('/roles/remove',
    roleMiddleware(['admin', 'super_admin']), 
    AuthHandlers.assignRoleHandler // Placeholder - criar handler para remover
  );

  secured.get('/roles/user/:userId', AuthHandlers.listUsersHandler); // Placeholder

  secured.get('/roles', AuthHandlers.listUsersHandler); // Placeholder

  // Lista de usuários (admin only)
  secured.get('/users', 
    roleMiddleware(['admin', 'super_admin']),
    AuthHandlers.listUsersHandler
  );

  return app;
}