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
      console.log('🔍 D1 Execute:', sql);
      console.log('🔍 D1 Params:', params);
      console.log('🔍 D1 Config:', {
        accountId: this.config.accountId,
        databaseId: this.config.databaseId,
        apiToken: this.config.apiToken ? '***' : 'missing'
      });

      try {
        // Fazer chamada real para a API do Cloudflare D1
        const url = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/d1/database/${this.config.databaseId}/query`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sql: sql,
            params: params
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ D1 API Error:', response.status, errorText);
          throw new Error(`D1 API Error: ${response.status} - ${errorText}`);
        }

        const data: CloudflareD1ApiResponse = await response.json();
        console.log('✅ D1 API Response:', data);

        if (!data.success) {
          console.error('❌ D1 Query failed:', data.errors);
          return {
            success: false,
            errors: data.errors
          };
        }

        // Extrair o primeiro resultado da resposta
        const result = data.result[0];
        if (!result) {
          console.log('⚠️ No results from D1');
          return {
            success: true,
            result: {
              results: [],
              meta: {
                changes: 0,
                last_row_id: 0,
                rows_read: 0,
                rows_written: 0
              }
            }
          };
        }

        return {
          success: true,
          result: {
            results: result.results || [],
            meta: result.meta || {
              changes: 0,
              last_row_id: 0,
              rows_read: 0,
              rows_written: 0
            }
          }
        };

      } catch (error) {
        console.error('❌ D1 Client Error:', error);
        return {
          success: false,
          errors: [{
            code: 500,
            message: error instanceof Error ? error.message : 'Unknown error'
          }]
        };
      }
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