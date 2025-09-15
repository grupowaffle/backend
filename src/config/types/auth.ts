import { UserData } from "./common";

export interface LoginRequest {
    email: string;
    password: string;
  }
  
  export interface RegisterRequest {
    email: string;
    password: string;
    brand_name: string;
    role?: string;
  }
  
  export interface LoginResponse {
    success: boolean;
    user?: UserData;
    tokens?: {
      jwt: string;
      session: string;
    };
    error?: string;
  }
  
  export interface RegisterResponse {
    success: boolean;
    user?: UserData;
    message?: string;
    error?: string;
  }
  
  export interface ProfileResponse {
    success: boolean;
    user: UserData;
    isMasterAccess: boolean;
  }
  
  export interface CloudflareD1ApiResponse {
    result: Array<{
      results: any[];
      success: boolean;
      meta: {
        served_by?: string;
        served_by_region?: string;
        served_by_primary?: boolean;
        timings?: {
          sql_duration_ms: number;
        };
        duration?: number;
        changes?: number;
        last_row_id?: number;
        changed_db?: boolean;
        size_after?: number;
        rows_read?: number;
        rows_written?: number;
        total_attempts?: number;
      };
    }>;
    errors: any[];
    messages: any[];
    success: boolean;
  }

  export interface D1QueryResult {
    success: boolean;
    result?: {
      results?: any[];
      meta?: {
        changes?: number;
        last_row_id?: number;
        rows_read?: number;
        rows_written?: number;
      };
    };
    errors?: Array<{
      code: number;
      message: string;
    }>;
  }
  
  export interface D1ClientConfig {
    accountId: string;
    databaseId: string;
    apiToken: string;
  }

  export class CloudflareD1Client {
    private config: D1ClientConfig;

    constructor(config: D1ClientConfig) {
      this.config = config;
    }

    async execute(sql: string, params: any[] = []): Promise<D1QueryResult> {
      // Implementação simplificada - em produção, usar a API real do D1
      console.log('D1 Execute:', sql, params);
      
      // Mock de dados para desenvolvimento
      console.log('🔍 Verificando SQL:', sql);
      console.log('🔍 Parâmetros:', params);
      
      if (sql.includes('SELECT * FROM users WHERE id = ?')) {
        const userId = params[0];
        console.log('🔍 User ID encontrado:', userId);
        if (userId === 'dev') {
          console.log('✅ Retornando dados do usuário dev');
          return {
            success: true,
            result: {
              results: [{
                id: 'dev',
                email: 'dev@example.com',
                name: 'Usuário Desenvolvimento',
                firstName: 'Dev',
                lastName: 'User',
                bio: 'Usuário de desenvolvimento',
                avatar: null,
                phone: null,
                timezone: 'America/Sao_Paulo',
                language: 'pt-BR',
                role: 'admin',
                permissions: '["all"]',
                brandId: null,
                brandName: null,
                isActive: true,
                emailVerified: true,
                twoFactorEnabled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              meta: {
                changes: 0,
                last_row_id: 0,
                rows_read: 1,
                rows_written: 0
              }
            }
          };
        }
      }
      
      // Suporte para login por email
      if (sql.includes('SELECT * FROM users WHERE email = ?')) {
        const email = params[0];
        console.log('🔍 Email encontrado:', email);
        if (email === 'dev@example.com') {
          console.log('✅ Retornando dados do usuário para login');
          return {
            success: true,
            result: {
              results: [{
                id: 'dev',
                email: 'dev@example.com',
                password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password: "password"
                name: 'Usuário Desenvolvimento',
                firstName: 'Dev',
                lastName: 'User',
                bio: 'Usuário de desenvolvimento',
                avatar: null,
                phone: null,
                timezone: 'America/Sao_Paulo',
                language: 'pt-BR',
                role: 'admin',
                permissions: '["all"]',
                brandId: null,
                brandName: null,
                isActive: true,
                emailVerified: true,
                twoFactorEnabled: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              meta: {
                changes: 0,
                last_row_id: 0,
                rows_read: 1,
                rows_written: 0
              }
            }
          };
        }
      }
      
      // Simular que não há usuários no D1 (para desenvolvimento)
      // Em produção, aqui seria feita a chamada real para a API do D1
      return {
        success: true,
        result: {
          results: [], // Simular tabela vazia
          meta: {
            changes: 0,
            last_row_id: 0,
            rows_read: 0,
            rows_written: 0
          }
        }
      };
    }

    async query(sql: string, params: any[] = []): Promise<D1QueryResult> {
      return this.execute(sql, params);
    }
  }

  
  export interface JWTPayload {
    userId?: number | string;
    email?: string;
    role?: string;
    brand_name?: string;
    brandId?: number | string;
    permissions?: string[];
    roles?: string[];
    sessionToken?: string;
    isMasterAccess?: boolean;
    isDevelopment?: boolean;
    exp?: number;
  }
  
  export interface SessionData {
    id: string;
    user_id: number;
    expires_at: string;
    user?: UserData;
  }
  
  export interface LoginCredentials {
    email: string;
    password: string;
  }
  
  export interface RegisterData {
    email: string;
    password: string;
    brand_name: string;
    role?: string;
  }