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