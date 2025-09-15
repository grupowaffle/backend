import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { users } from '../config/db/schema';
import { getDb } from '../config/db/connection';

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  brandId?: string | null;
  brandName?: string | null;
}

declare module 'hono' {
  interface ContextVariableMap {
    user?: AuthUser;
  }
}

export const authMiddleware = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error('JWT_SECRET not configured');
      return c.json({ error: 'Server configuration error' }, 500);
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (!user) {
      return c.json({ error: 'User not found' }, 401);
    }

    c.set('user', {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      brandId: user.brandId,
      brandName: user.brandName,
    });

    await next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return c.json({ error: 'Invalid token' }, 401);
    }
    if (error instanceof jwt.TokenExpiredError) {
      return c.json({ error: 'Token expired' }, 401);
    }
    
    console.error('Auth middleware error:', error);
    return c.json({ error: 'Authentication failed' }, 401);
  }
};

export const requireRole = (...allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: 'Insufficient permissions' }, 403);
    }

    await next();
  };
};

export const optionalAuth = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      await next();
      return;
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      await next();
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, decoded.userId))
      .limit(1);

    if (user) {
      c.set('user', {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        brandId: user.brandId,
        brandName: user.brandName,
      });
    }

    await next();
  } catch (error) {
    await next();
  }
};