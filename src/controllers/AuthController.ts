import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { AuthService } from '../services/AuthService';
import { authMiddleware, requireRole } from '../middleware/auth';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().optional(),
  role: z.enum(['admin', 'editor-chefe', 'editor', 'revisor']).optional(),
});

const changePasswordSchema = z.object({
  oldPassword: z.string(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  brandId: z.string().optional(),
  brandName: z.string().optional(),
});

const changeRoleSchema = z.object({
  role: z.enum(['admin', 'editor-chefe', 'editor', 'revisor']),
});

export class AuthController {
  private app: Hono;
  private authService: AuthService;

  constructor(env: any) {
    this.app = new Hono();
    this.authService = new AuthService(env);
    this.setupRoutes();
  }

  private setupRoutes() {
    // Public routes
    this.app.post('/login', zValidator('json', loginSchema), async (c) => {
      try {
        const dto = c.req.valid('json');
        const result = await this.authService.login(dto);
        
        return c.json({
          success: true,
          data: result,
        });
      } catch (error) {
        console.error('Login error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Login failed',
        }, 401);
      }
    });

    this.app.post('/register', zValidator('json', registerSchema), async (c) => {
      try {
        const dto = c.req.valid('json');
        const result = await this.authService.register(dto);
        
        return c.json({
          success: true,
          data: result,
        }, 201);
      } catch (error) {
        console.error('Registration error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Registration failed',
        }, 400);
      }
    });

    // Protected routes
    this.app.use('/me/*', authMiddleware);
    
    this.app.get('/me', authMiddleware, async (c) => {
      const user = c.get('user');
      
      return c.json({
        success: true,
        data: user,
      });
    });

    this.app.put('/me/password', authMiddleware, zValidator('json', changePasswordSchema), async (c) => {
      try {
        const user = c.get('user');
        const { oldPassword, newPassword } = c.req.valid('json');
        
        await this.authService.changePassword(user!.id, oldPassword, newPassword);
        
        return c.json({
          success: true,
          message: 'Password changed successfully',
        });
      } catch (error) {
        console.error('Change password error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to change password',
        }, 400);
      }
    });

    this.app.put('/me/profile', authMiddleware, zValidator('json', updateProfileSchema), async (c) => {
      try {
        const user = c.get('user');
        const data = c.req.valid('json');
        
        await this.authService.updateProfile(user!.id, data);
        
        return c.json({
          success: true,
          message: 'Profile updated successfully',
        });
      } catch (error) {
        console.error('Update profile error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update profile',
        }, 400);
      }
    });

    // Admin routes
    this.app.use('/users/*', authMiddleware, requireRole('admin'));
    
    this.app.get('/users', authMiddleware, requireRole('admin'), async (c) => {
      try {
        const role = c.req.query('role');
        const users = await this.authService.listUsers(role);
        
        return c.json({
          success: true,
          data: users,
        });
      } catch (error) {
        console.error('List users error:', error);
        return c.json({
          success: false,
          error: 'Failed to list users',
        }, 500);
      }
    });

    this.app.put('/users/:id/role', authMiddleware, requireRole('admin'), zValidator('json', changeRoleSchema), async (c) => {
      try {
        const userId = c.req.param('id');
        const { role } = c.req.valid('json');
        const performer = c.get('user');
        
        await this.authService.changeUserRole(userId, role, performer!.id);
        
        return c.json({
          success: true,
          message: 'User role updated successfully',
        });
      } catch (error) {
        console.error('Change role error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to change user role',
        }, 400);
      }
    });

    // Validate token endpoint
    this.app.post('/validate', async (c) => {
      try {
        const authHeader = c.req.header('Authorization');
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return c.json({
            success: false,
            valid: false,
          });
        }

        const token = authHeader.substring(7);
        const userId = await this.authService.validateToken(token);
        
        return c.json({
          success: true,
          valid: userId !== null,
          userId,
        });
      } catch (error) {
        return c.json({
          success: false,
          valid: false,
        });
      }
    });
  }

  getApp() {
    return this.app;
  }
}