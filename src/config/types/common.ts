import { R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  // Credenciais de acesso
  FACEBOOK_ACCESS_TOKEN: string;
  TIKTOK_ACCESS_TOKEN: string;
  INSTAGRAM_ACCESS_TOKEN: string;
  GEMINI_API_KEY: string;
  BEEHIIV_API_KEY: string;
  BEEHIIV_MARKETING_API_KEY: string;
  BEEHIIV_BRANDS_API_KEY: string;
  BEEHIIV_INTELLIGENCE_API_KEY: string;
  RESEND_API_KEY: string;
  WA_TOKEN: string;
  WA_BUSINESS_NUMBER: string;
  META_CONVERSION_TOKEN: string;
  TRACKING_BASE_URL: string;

  // Configurações de banco de dados
  DB: D1Database;
  DB_FORMS: D1Database;
  TICKETS: D1Database;
  STREAKS: D1Database;
  ACQUISITIONS: D1Database;
  CRM: D1Database;
  PIXEL: D1Database;
  SOCIAL: D1Database;
  ACTIVATIONS: D1Database;
  SUBSCRIBERS: D1Database;
  URL_TRACKING: D1Database;
  AUTHENTICATION: D1Database;
  
  // URLs de banco de dados
  DATABASE_URL?: string;
  NEON_URL?: string;
  FILE_STORAGE: R2Bucket;
  // Cache global
  CACHE: KVNamespace;

  // Variáveis de ambiente
  JWT_SECRET: string;
  WEBHOOK_VERIFY_TOKEN: string | undefined;
  newBeeviivApikey: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  JWT_USERS: string;
  MASTER_PASSWORD: string; // Senha mestra para acesso privilegiado
  
  // Cloudflare D1 REST API
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_D1_DATABASE_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  DEV_TOKEN: string;
  // Configurações de servidores
  HOME_SERVER: string;
  REFERRALS_SERVER: string;

  // Outros
  IG_THENEWS: string;
  IG_THEBIZ: string;
  bucket: R2Bucket;
  ASSETS: R2Bucket;
  BROWSER: Fetcher;
  GOOGLE_WEBHOOK_URL: string;
}

export interface AcquisitionWebhookData {
  automation_id: string;
  automation_journey_id: string;
  automation_journey_step_started_at: string;
  subscriber_email: string;
  subscriber_id: string;
  test: boolean;
}

export interface UserData {
  id: number | string; // Aceita string para suportar acesso via master password
  email: string;
  role: string;
  brand_name: string;
  brandId: number | string; // Pode ser string para IDs especiais como 'master'
  permissions: string[];
  roles?: string[]; // Array de roles do usuário
}

export interface CustomJWTPayload {
  [key: string]: any;
  userId: number | string; // Aceita string para suportar acesso master
  email: string;
  role: string;
  exp: number;
  iat?: number;
  isMasterAccess?: boolean; // Flag para identificar acesso via senha mestra
}

export interface ReferralJWTPayload {
  [key: string]: any;
  email: string;
  exp: number;
  iat?: number;
}