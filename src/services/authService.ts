import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
// Users table removed - using D1 for user management
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
  sessionToken?: string;
}

export class AuthService {
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private env: any;
  private d1Client?: CloudflareD1Client;

  constructor(envOrD1Client?: any, env?: any) {
    // Se é um D1Client, extrair env dele
    if (envOrD1Client && typeof envOrD1Client === 'object' && 'execute' in envOrD1Client) {
      this.d1Client = envOrD1Client;
      this.env = env; // Usar env passado como segundo parâmetro
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
      // Usar D1 - buscar usuário e credenciais separadamente
      console.log('🔍 D1: Searching for user with email:', dto.email);
      
      // Buscar usuário na tabela users
      const userResult = await this.d1Client.execute(
        'SELECT * FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
        [dto.email.toLowerCase()]
      );

      if (!userResult.success || !userResult.result?.results || userResult.result.results.length === 0) {
        console.log('❌ D1: No active user found for email:', dto.email);
        throw new Error('Invalid credentials');
      }

      const user = userResult.result.results[0] as any;
      console.log('✅ D1: User found:', { id: user.id, email: user.email, display_name: user.display_name });

      // Buscar credenciais na tabela user_credentials (mais recente primeiro)
      const credentialsResult = await this.d1Client.execute(
        'SELECT * FROM user_credentials WHERE user_id = ? ORDER BY password_updated_at DESC LIMIT 1',
        [user.id]
      );

      if (!credentialsResult.success || !credentialsResult.result?.results || credentialsResult.result.results.length === 0) {
        console.log('❌ D1: No credentials found for user:', user.id);
        throw new Error('Invalid credentials');
      }

      const credentials = credentialsResult.result.results[0] as any;
      console.log('✅ D1: Credentials found for user:', user.id);

      // Verificar senha usando SHA-256 com salt (formato do D1)
      // Usar Web Crypto API que está disponível no Cloudflare Workers
      const encoder = new TextEncoder();
      const data = encoder.encode(dto.password + credentials.salt);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (hashedPassword !== credentials.password_hash) {
        console.log('❌ D1: Invalid password for user:', user.id);
        console.log('🔍 Expected:', credentials.password_hash);
        console.log('🔍 Got:', hashedPassword);
        throw new Error('Invalid credentials');
      }

      // Buscar role do usuário
      const roleResult = await this.d1Client.execute(
        `SELECT r.name as role_name, r.permissions 
         FROM user_roles ur 
         JOIN roles r ON ur.role_id = r.id 
         WHERE ur.user_id = ? AND ur.is_active = 1 
         LIMIT 1`,
        [user.id]
      );

      let userRole = 'user'; // Default role
      let permissions = '[]';
      
      if (roleResult.success && roleResult.result?.results && roleResult.result.results.length > 0) {
        const role = roleResult.result.results[0] as any;
        userRole = role.role_name || 'user';
        permissions = role.permissions || '[]';
        console.log('✅ D1: Role found:', { role: userRole, permissions });
      } else {
        console.log('⚠️ D1: No role found for user, using default role');
      }

      const token = this.generateToken(user.id);

      // Parse permissions from JSON string
      let parsedPermissions: string[] = [];
      try {
        parsedPermissions = JSON.parse(permissions);
      } catch (e) {
        console.log('⚠️ D1: Failed to parse permissions, using empty array');
        parsedPermissions = [];
      }

      return {
        token,
        user: {
          id: user.id.toString(),
          email: user.email,
          name: user.display_name,
          role: userRole,
          permissions: parsedPermissions,
          brandId: null, // D1 não tem brand_id
          brandName: null, // D1 não tem brand_name
        },
        sessionToken: 'd1-session-token',
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
        sessionToken: 'neon-session-token', // Placeholder para Neon
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
    const db = getDb(this.env);
    
    await db
      .update(users)
      .set({ 
        ...data,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async changeUserRole(userId: string, newRole: string, performedBy: string): Promise<void> {
    const db = getDb(this.env);
    
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
    const db = getDb(this.env);
    
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

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Token inválido');
    }
  }

  async logout(token: string): Promise<void> {
    try {
      // Verificar se o token é válido
      const decoded = this.verifyToken(token);
      
      if (this.d1Client) {
        // Para D1, apenas logar o logout (não há sessões para invalidar)
        console.log('🔓 D1: User logout:', { userId: decoded.userId, email: decoded.email });
        
        // Opcional: invalidar token no D1 se houver tabela de tokens
        // Por enquanto, apenas logamos o logout
        return;
      } else {
        // Para Neon, invalidar sessão se houver tabela de sessões
        console.log('🔓 Neon: User logout:', { userId: decoded.userId, email: decoded.email });
        return;
      }
    } catch (error) {
      console.error('❌ Logout error:', error);
      throw new Error('Erro ao fazer logout');
    }
  }

  async validateSession(sessionToken: string): Promise<UserData | null> {
    try {
      if (this.d1Client) {
        // Para D1, validar sessionToken simples
        if (sessionToken === 'd1-session-token') {
          // 'd1-session-token' é um placeholder - não retornar dados falsos
          // Retornar null para usar os dados do JWT original
          return null;
        }
        return null;
      } else {
        // Para Neon, validar sessão no banco
        return null;
      }
    } catch (error) {
      console.error('❌ Validate session error:', error);
      return null;
    }
  }
}