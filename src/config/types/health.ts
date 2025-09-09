export interface HealthStatus {
  status: 'ok' | 'error';
  message: string;
  timestamp: string;
  database?: string;
  connection?: string;
  userCount?: number;
  hasNeonUrl?: boolean;
  hasDatabaseUrl?: boolean;
  error?: string;
}

export interface TestUser {
  id: number;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserCreationResult {
  status: 'ok' | 'error';
  message: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  totalUsers?: number;
  database?: string;
  timestamp: string;
  error?: string;
}

export interface DebugInfo {
  status: 'debug' | 'error';
  message: string;
  hasDatabaseUrl: boolean;
  hasNeonUrl: boolean;
  databaseUrlLength: number;
  neonUrlLength: number;
  databaseType: string;
  orm: string;
  timestamp: string;
  error?: string;
}