import { z } from 'zod';

// Tipos de arquivo suportados
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;
export const SUPPORTED_DOCUMENT_TYPES = ['application/pdf'] as const;
export const SUPPORTED_FILE_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_DOCUMENT_TYPES] as const;

// Limites de tamanho (em bytes)
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_DOCUMENT_SIZE = 50 * 1024 * 1024; // 50MB

// Tipos TypeScript
export type SupportedFileType = typeof SUPPORTED_FILE_TYPES[number];
export type SupportedImageType = typeof SUPPORTED_IMAGE_TYPES[number];
export type SupportedDocumentType = typeof SUPPORTED_DOCUMENT_TYPES[number];

export interface FileUploadMetadata {
  fileName: string;
  fileType: string;
  fileSize: number;
  uploadedBy?: string;
  module: string; // 'articles', 'media', 'profiles', etc.
  entityId?: string; // ID da entidade relacionada (articleId, etc.)
  description?: string;
}

export interface UploadedFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  r2Key: string;
  r2Url: string; // URL interna do R2 (não pública)
  internalUrl: string; // URL para servir via Worker
  module: string;
  entityId?: string;
  uploadedBy?: string;
  description?: string;
  uploadedAt: string;
  tags?: string[];
  alt?: string; // Para acessibilidade de imagens
}

export interface PresignedUploadUrl {
  uploadUrl: string;
  fileKey: string;
  internalUrl: string; // URL que será servida pelo Worker
  expiresIn: number;
}

export interface FileUploadRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
  module: string;
  entityId?: string;
  description?: string;
  alt?: string;
  tags?: string[];
}

// Schemas de validação
export const fileUploadRequestSchema = z.object({
  fileName: z.string().min(1, 'Nome do arquivo é obrigatório').max(255, 'Nome muito longo'),
  fileType: z.enum(SUPPORTED_FILE_TYPES, {
    errorMap: () => ({ message: 'Tipo de arquivo não suportado. Use: JPG, PNG, GIF, WEBP ou PDF' })
  }),
  fileSize: z.number().positive('Tamanho do arquivo deve ser positivo').refine((size) => {
    return size <= MAX_DOCUMENT_SIZE;
  }, {
    message: 'Arquivo muito grande. Máximo: 10MB para imagens, 50MB para PDFs'
  }),
  module: z.string().min(1, 'Módulo é obrigatório'),
  entityId: z.string().optional(),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  alt: z.string().max(200, 'Texto alternativo muito longo').optional(),
  tags: z.array(z.string().max(50)).max(10, 'Máximo 10 tags').optional()
}).refine((data) => {
  // Validação específica por tipo de arquivo
  if (SUPPORTED_IMAGE_TYPES.includes(data.fileType as SupportedImageType)) {
    return data.fileSize <= MAX_IMAGE_SIZE;
  }
  if (SUPPORTED_DOCUMENT_TYPES.includes(data.fileType as SupportedDocumentType)) {
    return data.fileSize <= MAX_DOCUMENT_SIZE;
  }
  return true;
}, {
  message: 'Tamanho de arquivo inválido para o tipo especificado',
  path: ['fileSize']
});

export const fileDeleteRequestSchema = z.object({
  fileKey: z.string().min(1, 'Chave do arquivo é obrigatória')
});

export const fileListRequestSchema = z.object({
  module: z.string().optional(),
  entityId: z.string().optional(),
  fileType: z.enum([...SUPPORTED_FILE_TYPES]).optional(),
  tags: z.array(z.string()).optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  search: z.string().max(100).optional()
});

// Tipos inferidos dos schemas
export type FileUploadRequestData = z.infer<typeof fileUploadRequestSchema>;
export type FileDeleteRequestData = z.infer<typeof fileDeleteRequestSchema>;
export type FileListRequestData = z.infer<typeof fileListRequestSchema>;

// Tipos de resposta da API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface FileListResponse {
  files: UploadedFile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Configurações do R2
export interface R2Config {
  bucketName: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxFileSize: number;
  allowedTypes: string[];
  region?: string;
}

// Configurações de processamento de imagem
export interface ImageProcessingOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
  resize?: 'fit' | 'fill' | 'contain' | 'cover';
}

// Variações de imagem (thumbnails, etc)
export interface ImageVariant {
  name: string; // 'thumbnail', 'medium', 'large', 'original'
  width?: number;
  height?: number;
  quality?: number;
  r2Key: string;
  url: string;
}

export interface ProcessedImage extends UploadedFile {
  variants: ImageVariant[];
  dimensions?: {
    width: number;
    height: number;
  };
}

// Erros customizados
export class FileUploadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'FileUploadError';
  }
}

export class FileSizeError extends FileUploadError {
  constructor(maxSize: number, actualSize: number) {
    super(
      `Arquivo muito grande. Máximo: ${Math.round(maxSize / 1024 / 1024)}MB, atual: ${Math.round(actualSize / 1024 / 1024)}MB`, 
      'FILE_TOO_LARGE'
    );
  }
}

export class FileTypeError extends FileUploadError {
  constructor(allowedTypes: string[]) {
    super(`Tipo de arquivo não permitido. Tipos aceitos: ${allowedTypes.join(', ')}`, 'INVALID_FILE_TYPE');
  }
}

export class R2ConnectionError extends FileUploadError {
  constructor(message: string) {
    super(`Erro de conexão com R2: ${message}`, 'R2_CONNECTION_ERROR');
  }
}

export class ImageProcessingError extends FileUploadError {
  constructor(message: string) {
    super(`Erro no processamento da imagem: ${message}`, 'IMAGE_PROCESSING_ERROR');
  }
}

// Configurações predefinidas de variantes de imagem
export const IMAGE_VARIANTS = {
  thumbnail: { width: 150, height: 150, quality: 85, resize: 'cover' as const },
  small: { width: 300, height: 300, quality: 85, resize: 'fit' as const },
  medium: { width: 600, height: 600, quality: 90, resize: 'fit' as const },
  large: { width: 1200, height: 1200, quality: 95, resize: 'fit' as const }
} as const;

// Módulos suportados
export const SUPPORTED_MODULES = [
  'articles',
  'profiles', 
  'categories',
  'general',
  'beehiiv',
  'featured'
] as const;

export type SupportedModule = typeof SUPPORTED_MODULES[number];