import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { users } from '../config/db/schema';
import { getDb } from '../config/db/connection';
import { generateId } from '../lib/cuid';
import { CloudflareD1Client } from '../config/types/auth';

export interface LoginDTO {
  email: string;
  password: string;
}

export interface RegisterDTO {
  email: string;
  password: string;
  name?: string;
  role?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name?: string | null;
    role: string;
    brandId?: string | null;
    brandName?: string | null;
  };
}

export class AuthService {
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private env: any;
  private d1Client?: CloudflareD1Client;

  constructor(envOrD1Client?: any) {
    // Se é um D1Client, extrair env dele
    if (envOrD1Client && typeof envOrD1Client === 'object' && 'execute' in envOrD1Client) {
      this.d1Client = envOrD1Client;
      this.env = null; // D1Client não tem env diretamente
    } else {
      this.env = envOrD1Client;
      this.d1Client = null;
    }
    
    this.jwtSecret = this.env?.JWT_SECRET || process.env.JWT_SECRET || '';
    this.jwtExpiresIn = this.env?.JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '7d';

    if (!this.jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }
  }

  async login(dto: LoginDTO): Promise<AuthResponse> {
    if (this.d1Client) {
      // Usar D1
      const result = await this.d1Client.execute(
        'SELECT * FROM users WHERE email = ? LIMIT 1',
        [dto.email.toLowerCase()]
      );

      if (!result.success || !result.results || result.results.length === 0) {
        console.log('D1: No user found for email:', dto.email);
        throw new Error('Invalid credentials');
      }

      const user = result.results[0] as any;

      // Verificar senha (assumindo que está hasheada no D1)
      const isValidPassword = await bcrypt.compare(dto.password, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Invalid credentials');
      }

      const token = this.generateToken(user.id);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          brandId: user.brand_id,
          brandName: user.brand_name,
        },
      };
    } else {
      // Usar Neon
      const db = getDb(this.env);
      
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, dto.email.toLowerCase()))
        .limit(1);

      if (!user) {
        throw new Error('Invalid credentials');
      }

      const token = this.generateToken(user.id);

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          brandId: user.brandId,
          brandName: user.brandName,
        },
      };
    }
  }

  async register(dto: RegisterDTO): Promise<AuthResponse> {
    const db = getDb(this.env);
    
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, dto.email.toLowerCase()))
      .limit(1);

    if (existingUser.length > 0) {
      throw new Error('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const newUser = {
      id: generateId(),
      email: dto.email.toLowerCase(),
      name: dto.name,
      role: dto.role || 'editor',
    };

    const [createdUser] = await db
      .insert(users)
      .values(newUser)
      .returning();

    const token = this.generateToken(createdUser.id);

    return {
      token,
      user: {
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.name,
        role: createdUser.role,
        brandId: createdUser.brandId,
        brandName: createdUser.brandName,
      },
    };
  }

  async updateProfile(userId: string, data: { name?: string; brandId?: string; brandName?: string }): Promise<void> {
    const db = getDb();
    
    await db
      .update(users)
      .set({ 
        ...data,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async changeUserRole(userId: string, newRole: string, performedBy: string): Promise<void> {
    const db = getDb();
    
    const [performer] = await db
      .select()
      .from(users)
      .where(eq(users.id, performedBy))
      .limit(1);

    if (!performer || performer.role !== 'admin') {
      throw new Error('Only admins can change user roles');
    }

    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      throw new Error('User not found');
    }

    await db
      .update(users)
      .set({ 
        role: newRole,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async listUsers(role?: string) {
    const db = getDb();
    
    let query = db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      brandId: users.brandId,
      brandName: users.brandName,
      createdAt: users.createdAt,
    }).from(users);

    if (role) {
      query = query.where(eq(users.role, role));
    }

    return await query;
  }

  private generateToken(userId: string): string {
    return jwt.sign(
      { userId },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  async validateToken(token: string): Promise<string | null> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as { userId: string };
      return decoded.userId;
    } catch {
      return null;
    }
  }
}