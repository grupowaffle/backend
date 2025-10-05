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

  // Configuração de banco de dados - APENAS NEON
  DATABASE_URL?: string; // URL principal do Neon PostgreSQL
  NEON_URL?: string; // URL alternativa do Neon (fallback)
  
  // R2 Storage
  FILE_STORAGE: R2Bucket;
  MEDIA_BUCKET: R2Bucket; // Bucket específico para imagens do CMS
  R2_DOMAIN?: string; // Domínio público do R2 para servir imagens
  
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
  
  // Cloudflare R2 e Workers
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  
  // Cloudflare R2 Configuration for Advanced Image Upload
  CLOUDFLARE_BUCKET_NAME: string;
  CLOUDFLARE_ACCESS_KEY_ID: string;
  CLOUDFLARE_SECRET_ACCESS_KEY: string;
  CLOUDFLARE_PUBLIC_URL: string;
  
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
  name: string; // Nome do usuário
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