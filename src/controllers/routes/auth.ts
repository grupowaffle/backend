import { Hono } from 'hono';
import { Env, UserData } from '../../config/types/common';
import { authMiddleware, roleMiddleware } from '../../middlewares/auth';
import { AuthHandlers } from '../../handlers/authHandlers';
import { AuthService } from '../../services/authService';

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
      
      const d1Client = AuthHandlers.createD1Client(env);

      // Test simple query
      const result = await d1Client.execute('SELECT COUNT(*) as count FROM users');
      
      return c.json({
        success: true,
        d1Connection: true,
        userCount: result.results?.[0]?.count || 0,
        database: 'cloudflare-d1'
      });
    } catch (error) {
      console.error('Debug D1 test error:', error);
      return c.json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        database: 'cloudflare-d1'
      });
    }
  });

      // List all users in D1
      app.get('/debug/list-users', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);

          // Usar a estrutura real da tabela
          const result = await d1Client.execute('SELECT * FROM users LIMIT 10');

          return c.json({
            success: true,
            users: result.result?.results || [],
            count: result.result?.results?.length || 0
          });
        } catch (error) {
          console.error('List users error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // List user credentials
      app.get('/debug/list-credentials', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);

          const result = await d1Client.execute('SELECT * FROM user_credentials LIMIT 10');

          return c.json({
            success: true,
            credentials: result.result?.results || [],
            count: result.result?.results?.length || 0
          });
        } catch (error) {
          console.error('List credentials error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // List roles
      app.get('/debug/list-roles', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);

          const result = await d1Client.execute('SELECT * FROM roles LIMIT 10');

          return c.json({
            success: true,
            roles: result.result?.results || [],
            count: result.result?.results?.length || 0
          });
        } catch (error) {
          console.error('List roles error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // List user roles
      app.get('/debug/list-user-roles', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);

          const result = await d1Client.execute('SELECT * FROM user_roles LIMIT 10');

          return c.json({
            success: true,
            userRoles: result.result?.results || [],
            count: result.result?.results?.length || 0
          });
        } catch (error) {
          console.error('List user roles error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Check specific user credentials
      app.get('/debug/user/:userId/credentials', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);
          const userId = c.req.param('userId');

          const result = await d1Client.execute('SELECT * FROM user_credentials WHERE user_id = ?', [userId]);

          return c.json({
            success: true,
            credentials: result.result?.results || [],
            count: result.result?.results?.length || 0
          });
        } catch (error) {
          console.error('User credentials error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Test password hash
      app.post('/debug/test-hash', async (c) => {
        try {
          const body = await c.req.json();
          const { password, salt, expectedHash } = body;

          // Usar Web Crypto API
          const encoder = new TextEncoder();
          const data = encoder.encode(password + salt);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          return c.json({
            success: true,
            password,
            salt,
            expectedHash,
            calculatedHash: hashedPassword,
            matches: hashedPassword === expectedHash
          });
        } catch (error) {
          console.error('Test hash error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Find user by email and get credentials
      app.get('/debug/user-by-email/:email', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);
          const email = c.req.param('email');

          // Buscar usuário por email
          const userResult = await d1Client.execute('SELECT * FROM users WHERE email = ?', [email]);
          
          if (!userResult.success || !userResult.result?.results || userResult.result.results.length === 0) {
            return c.json({
              success: false,
              message: 'User not found'
            });
          }

          const user = userResult.result.results[0];
          
          // Buscar credenciais do usuário
          const credentialsResult = await d1Client.execute('SELECT * FROM user_credentials WHERE user_id = ?', [user.id]);
          
          // Buscar roles do usuário
          const rolesResult = await d1Client.execute(
            `SELECT r.name as role_name, r.permissions 
             FROM user_roles ur 
             JOIN roles r ON ur.role_id = r.id 
             WHERE ur.user_id = ? AND ur.is_active = 1`,
            [user.id]
          );

          return c.json({
            success: true,
            user,
            credentials: credentialsResult.result?.results || [],
            roles: rolesResult.result?.results || []
          });
        } catch (error) {
          console.error('User by email error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Create test credentials for existing user
      app.post('/debug/create-test-credentials', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);
          const body = await c.req.json();
          const { userId, password } = body;

          // Gerar salt aleatório
          const salt = crypto.randomUUID();
          
          // Gerar hash da senha
          const encoder = new TextEncoder();
          const data = encoder.encode(password + salt);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          // Inserir credenciais de teste
          const result = await d1Client.execute(
            'INSERT INTO user_credentials (user_id, password_hash, salt, password_updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [userId, passwordHash, salt]
          );

          return c.json({
            success: true,
            message: 'Test credentials created',
            userId,
            password,
            salt,
            passwordHash,
            result
          });
        } catch (error) {
          console.error('Create test credentials error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Test login logic step by step
      app.post('/debug/test-login', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);
          const body = await c.req.json();
          const { email, password } = body;

          console.log('🔍 Test login for email:', email);

          // Step 1: Buscar usuário
          const userResult = await d1Client.execute(
            'SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
            [email.toLowerCase()]
          );

          if (!userResult.success || !userResult.result?.results || userResult.result.results.length === 0) {
            return c.json({
              success: false,
              step: 'user_lookup',
              error: 'No active user found'
            });
          }

          const user = userResult.result.results[0];
          console.log('✅ User found:', { id: user.id, email: user.email });

          // Step 2: Buscar credenciais (mais recente primeiro)
          const credentialsResult = await d1Client.execute(
            'SELECT * FROM user_credentials WHERE user_id = ? ORDER BY password_updated_at DESC LIMIT 1',
            [user.id]
          );

          if (!credentialsResult.success || !credentialsResult.result?.results || credentialsResult.result.results.length === 0) {
            return c.json({
              success: false,
              step: 'credentials_lookup',
              error: 'No credentials found'
            });
          }

          const credentials = credentialsResult.result.results[0];
          console.log('✅ Credentials found:', { id: credentials.id, salt: credentials.salt });

          // Step 3: Verificar senha
          const encoder = new TextEncoder();
          const data = encoder.encode(password + credentials.salt);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          if (hashedPassword !== credentials.password_hash) {
            return c.json({
              success: false,
              step: 'password_verification',
              error: 'Invalid password',
              expected: credentials.password_hash,
              got: hashedPassword
            });
          }

          console.log('✅ Password verified');

          // Step 4: Buscar roles
          const roleResult = await d1Client.execute(
            `SELECT r.name as role_name, r.permissions 
             FROM user_roles ur 
             JOIN roles r ON ur.role_id = r.id 
             WHERE ur.user_id = ? AND ur.is_active = 1 
             LIMIT 1`,
            [user.id]
          );

          let userRole = 'user';
          if (roleResult.success && roleResult.result?.results && roleResult.result.results.length > 0) {
            const role = roleResult.result.results[0];
            userRole = role.role_name || 'user';
          }

          return c.json({
            success: true,
            user: {
              id: user.id.toString(),
              email: user.email,
              name: user.display_name,
              role: userRole
            },
            message: 'Login test successful'
          });

        } catch (error) {
          console.error('Test login error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Test JWT verification
      app.post('/debug/test-jwt', async (c) => {
        try {
          const env = c.env;
          const body = await c.req.json();
          const { token } = body;

          console.log('🔍 Testing JWT verification');
          console.log('🔍 JWT_SECRET:', env.JWT_SECRET ? '***' : 'missing');

          // Testar verificação do JWT
          const { verify } = await import('hono/jwt');
          const payload = await verify(token, env.JWT_SECRET);

          return c.json({
            success: true,
            payload,
            message: 'JWT verification successful'
          });

        } catch (error) {
          console.error('JWT verification error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Test middleware simulation
      app.post('/debug/test-middleware', async (c) => {
        try {
          const env = c.env;
          const body = await c.req.json();
          const { token } = body;

          console.log('🔍 Testing middleware simulation');

          // Simular o middleware de autenticação
          const { verify } = await import('hono/jwt');
          const payload = await verify(token, env.JWT_SECRET);

          // Verifica expiração do token
          if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return c.json({
              success: false,
              error: 'Token expirado'
            });
          }

          // Simular validação de sessão
          if (payload.sessionToken) {
            const d1Client = AuthHandlers.createD1Client(env);
            const authHandler = new AuthService(d1Client, env);
            const sessionUser = await authHandler.validateSession(payload.sessionToken);

            if (!sessionUser) {
              return c.json({
                success: false,
                error: 'Sessão inválida'
              });
            }

            return c.json({
              success: true,
              payload,
              sessionUser,
              message: 'Middleware simulation successful'
            });
          }

          return c.json({
            success: true,
            payload,
            message: 'Middleware simulation successful (no session)'
          });

        } catch (error) {
          console.error('Middleware simulation error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Create test credentials
      app.post('/debug/create-test-credentials', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);
          const body = await c.req.json();
          const { userId, password } = body;

          // Gerar salt aleatório
          const salt = crypto.randomUUID();
          
          // Gerar hash da senha
          const encoder = new TextEncoder();
          const data = encoder.encode(password + salt);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

          // Inserir credenciais
          const result = await d1Client.execute(
            'INSERT INTO user_credentials (user_id, password_hash, salt, password_updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [userId, passwordHash, salt]
          );

          return c.json({
            success: true,
            message: 'Test credentials created',
            userId,
            password,
            salt,
            passwordHash,
            result
          });
        } catch (error) {
          console.error('Create test credentials error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

      // Check table structure
      app.get('/debug/table-structure', async (c) => {
        try {
          const env = c.env;
          const d1Client = AuthHandlers.createD1Client(env);

          // Primeiro, listar todas as tabelas
          const tablesResult = await d1Client.execute("SELECT name FROM sqlite_master WHERE type='table'");
          console.log('📋 Tables found:', tablesResult);

          // Verificar estrutura das tabelas de autenticação
          const usersResult = await d1Client.execute("PRAGMA table_info(users)");
          const credentialsResult = await d1Client.execute("PRAGMA table_info(user_credentials)");
          const rolesResult = await d1Client.execute("PRAGMA table_info(user_roles)");

          return c.json({
            success: true,
            allTables: tablesResult.result?.results || [],
            usersTableInfo: usersResult.result?.results || [],
            credentialsTableInfo: credentialsResult.result?.results || [],
            rolesTableInfo: rolesResult.result?.results || [],
            message: 'Table structure retrieved'
          });
        } catch (error) {
          console.error('Table structure error:', error);
          return c.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });

  // Create test user endpoint
  app.post('/debug/create-test-user', async (c) => {
    try {
      const env = c.env;
      const d1Client = AuthHandlers.createD1Client(env);
      
      // Hash password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // Create test user
      const result = await d1Client.execute(
        'INSERT INTO users (email, password_hash, name, role, brand_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        ['admin@test.com', hashedPassword, 'Test Admin', 'admin', 'Test Brand']
      );
      
      return c.json({
        success: true,
        message: 'Test user created successfully',
        result: result
      });
    } catch (error) {
      console.error('Create test user error:', error);
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