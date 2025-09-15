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

  // Debug endpoint to test Neon connection
  app.get('/debug/neon-test', async (c) => {
    try {
      const env = c.env;
      console.log('Debug: Testing Neon PostgreSQL connection...');
      
      const { getDb } = await import('../../config/db/connection');
      const db = getDb(env);

      // Test simple query
      const result = await db.execute({ sql: 'SELECT COUNT(*) as count FROM users', args: [] });
      
      return c.json({
        success: true,
        neonConnection: true,
        userCount: result.rows?.[0]?.count || 0,
        database: 'neon-postgresql'
      });
    } catch (error) {
      console.error('Debug Neon test error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        database: 'neon-postgresql'
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