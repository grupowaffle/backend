/**
 * Serviço de integração direta com Cloudflare R2
 * Funciona dentro do ecossistema Cloudflare sem URLs públicas expostas
 */

import { 
  R2Config, 
  FileUploadMetadata, 
  UploadedFile, 
  PresignedUploadUrl,
  ImageVariant,
  ProcessedImage,
  IMAGE_VARIANTS,
  SUPPORTED_IMAGE_TYPES,
  R2ConnectionError,
  FileSizeError,
  FileTypeError,
  ImageProcessingError
} from '../config/types/media';
import { generateId } from '../lib/cuid';
import { Env } from '../config/types/common';

export class CloudflareR2Service {
  private config: R2Config;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.config = {
      bucketName: env.CLOUDFLARE_BUCKET_NAME || 'thenews-media',
      accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
      accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID || '',
      secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY || '',
      maxFileSize: 50 * 1024 * 1024, // 50MB
      allowedTypes: [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf'
      ]
    };
  }

  /**
   * Gera uma URL de upload pré-assinada
   */
  async generatePresignedUpload(
    metadata: FileUploadMetadata
  ): Promise<PresignedUploadUrl> {
    try {
      // Validar arquivo
      this.validateFile(metadata);

      // Gerar chave única para o arquivo
      const fileKey = this.generateFileKey(metadata);
      
      // No Cloudflare Workers, usamos R2 binding diretamente
      // A URL de upload será manipulada pelo próprio Worker
      const uploadUrl = `/api/cms/media/upload/${fileKey}`;
      const internalUrl = `/api/cms/media/serve/${fileKey}`;

      console.log(`📁 Generated presigned upload for: ${metadata.fileName}`);

      return {
        uploadUrl,
        fileKey,
        internalUrl,
        expiresIn: 3600, // 1 hora
      };

    } catch (error) {
      console.error('Error generating presigned upload:', error);
      throw new R2ConnectionError(
        error instanceof Error ? error.message : 'Failed to generate upload URL'
      );
    }
  }

  /**
   * Faz upload direto do arquivo para R2
   */
  async uploadFile(
    fileKey: string,
    file: ArrayBuffer,
    metadata: FileUploadMetadata
  ): Promise<UploadedFile> {
    try {
      // Validar arquivo
      this.validateFile(metadata);

      // Usar R2 binding do Cloudflare Workers
      if (!this.env.R2_BUCKET) {
        throw new R2ConnectionError('R2 bucket binding not found');
      }

      // Upload para R2
      await this.env.R2_BUCKET.put(fileKey, file, {
        httpMetadata: {
          contentType: metadata.fileType,
          contentLength: metadata.fileSize,
        },
        customMetadata: {
          fileName: metadata.fileName,
          module: metadata.module,
          entityId: metadata.entityId || '',
          uploadedBy: metadata.uploadedBy || '',
          description: metadata.description || '',
          uploadedAt: new Date().toISOString(),
        }
      });

      const uploadedFile: UploadedFile = {
        id: generateId(),
        fileName: metadata.fileName,
        fileType: metadata.fileType,
        fileSize: metadata.fileSize,
        r2Key: fileKey,
        r2Url: `r2://${this.config.bucketName}/${fileKey}`,
        internalUrl: `/api/cms/media/serve/${fileKey}`,
        module: metadata.module,
        entityId: metadata.entityId,
        uploadedBy: metadata.uploadedBy,
        description: metadata.description,
        uploadedAt: new Date().toISOString(),
      };

      console.log(`✅ File uploaded successfully: ${fileKey}`);

      // Se for imagem, processar variantes
      if (this.isImage(metadata.fileType)) {
        return await this.processImageVariants(uploadedFile, file);
      }

      return uploadedFile;

    } catch (error) {
      console.error('Error uploading file:', error);
      throw new R2ConnectionError(
        error instanceof Error ? error.message : 'Failed to upload file'
      );
    }
  }

  /**
   * Serve arquivo do R2 via Worker
   */
  async serveFile(fileKey: string): Promise<Response> {
    try {
      if (!this.env.R2_BUCKET) {
        throw new R2ConnectionError('R2 bucket binding not found');
      }

      const object = await this.env.R2_BUCKET.get(fileKey);

      if (!object) {
        return new Response('File not found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=31536000'); // 1 ano

      console.log(`📤 Serving file: ${fileKey}`);

      return new Response(object.body, { headers });

    } catch (error) {
      console.error('Error serving file:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  /**
   * Deleta arquivo do R2
   */
  async deleteFile(fileKey: string): Promise<boolean> {
    try {
      if (!this.env.R2_BUCKET) {
        throw new R2ConnectionError('R2 bucket binding not found');
      }

      await this.env.R2_BUCKET.delete(fileKey);

      // Se for imagem, deletar variantes também
      if (this.isImageKey(fileKey)) {
        await this.deleteImageVariants(fileKey);
      }

      console.log(`🗑️ File deleted: ${fileKey}`);
      return true;

    } catch (error) {
      console.error('Error deleting file:', error);
      throw new R2ConnectionError(
        error instanceof Error ? error.message : 'Failed to delete file'
      );
    }
  }

  /**
   * Lista arquivos no bucket
   */
  async listFiles(
    prefix?: string,
    limit: number = 100
  ): Promise<{ files: string[]; truncated: boolean }> {
    try {
      if (!this.env.R2_BUCKET) {
        throw new R2ConnectionError('R2 bucket binding not found');
      }

      const objects = await this.env.R2_BUCKET.list({
        prefix,
        limit,
      });

      const files = objects.objects.map(obj => obj.key);

      return {
        files,
        truncated: objects.truncated,
      };

    } catch (error) {
      console.error('Error listing files:', error);
      throw new R2ConnectionError(
        error instanceof Error ? error.message : 'Failed to list files'
      );
    }
  }

  /**
   * Processa variantes de imagem (thumbnails, etc)
   */
  private async processImageVariants(
    originalFile: UploadedFile, 
    originalBuffer: ArrayBuffer
  ): Promise<ProcessedImage> {
    try {
      const variants: ImageVariant[] = [];

      // Para cada variante definida
      for (const [variantName, config] of Object.entries(IMAGE_VARIANTS)) {
        try {
          // Gerar chave para variante
          const variantKey = this.generateVariantKey(originalFile.r2Key, variantName);
          
          // Processar imagem (redimensionar, comprimir)
          const processedBuffer = await this.resizeImage(originalBuffer, config);
          
          // Upload da variante
          await this.env.R2_BUCKET!.put(variantKey, processedBuffer, {
            httpMetadata: {
              contentType: originalFile.fileType,
            },
            customMetadata: {
              variant: variantName,
              originalKey: originalFile.r2Key,
              ...config,
            }
          });

          variants.push({
            name: variantName,
            width: config.width,
            height: config.height,
            quality: config.quality,
            r2Key: variantKey,
            url: `/api/cms/media/serve/${variantKey}`,
          });

          console.log(`🖼️ Created image variant: ${variantName}`);

        } catch (error) {
          console.error(`Failed to create variant ${variantName}:`, error);
          // Continue com outras variantes mesmo se uma falhar
        }
      }

      // Tentar extrair dimensões da imagem original
      const dimensions = await this.getImageDimensions(originalBuffer);

      const processedImage: ProcessedImage = {
        ...originalFile,
        variants,
        dimensions,
      };

      return processedImage;

    } catch (error) {
      console.error('Error processing image variants:', error);
      // Retornar arquivo original mesmo se processamento falhar
      return originalFile as ProcessedImage;
    }
  }

  /**
   * Redimensiona imagem (implementação simplificada)
   * Em produção, usaria uma biblioteca como sharp ou API externa
   */
  private async resizeImage(
    buffer: ArrayBuffer, 
    config: typeof IMAGE_VARIANTS[keyof typeof IMAGE_VARIANTS]
  ): Promise<ArrayBuffer> {
    // Por enquanto, retorna buffer original
    // Em implementação completa, usaria:
    // - Canvas API no Workers
    // - Cloudflare Images API
    // - Biblioteca de processamento de imagem
    
    console.log(`🔄 Processing image with config:`, config);
    return buffer;
  }

  /**
   * Extrai dimensões da imagem
   */
  private async getImageDimensions(buffer: ArrayBuffer): Promise<{ width: number; height: number } | undefined> {
    try {
      // Implementação básica - em produção usaria biblioteca apropriada
      // Por enquanto retorna dimensões padrão
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Deleta variantes de imagem
   */
  private async deleteImageVariants(originalKey: string): Promise<void> {
    try {
      for (const variantName of Object.keys(IMAGE_VARIANTS)) {
        const variantKey = this.generateVariantKey(originalKey, variantName);
        
        try {
          await this.env.R2_BUCKET!.delete(variantKey);
          console.log(`🗑️ Deleted variant: ${variantKey}`);
        } catch (error) {
          console.error(`Failed to delete variant ${variantKey}:`, error);
        }
      }
    } catch (error) {
      console.error('Error deleting image variants:', error);
    }
  }

  /**
   * Gera chave única para arquivo no R2
   */
  private generateFileKey(metadata: FileUploadMetadata): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const randomId = generateId();
    const extension = this.getFileExtension(metadata.fileName);
    
    return `${metadata.module}/${timestamp}/${randomId}${extension}`;
  }

  /**
   * Gera chave para variante de imagem
   */
  private generateVariantKey(originalKey: string, variantName: string): string {
    const basePath = originalKey.substring(0, originalKey.lastIndexOf('.'));
    const extension = originalKey.substring(originalKey.lastIndexOf('.'));
    
    return `${basePath}_${variantName}${extension}`;
  }

  /**
   * Obtém extensão do arquivo
   */
  private getFileExtension(fileName: string): string {
    const lastDot = fileName.lastIndexOf('.');
    return lastDot === -1 ? '' : fileName.substring(lastDot);
  }

  /**
   * Valida arquivo antes do upload
   */
  private validateFile(metadata: FileUploadMetadata): void {
    // Validar tamanho
    if (metadata.fileSize > this.config.maxFileSize) {
      throw new FileSizeError(this.config.maxFileSize, metadata.fileSize);
    }

    // Validar tipo
    if (!this.config.allowedTypes.includes(metadata.fileType)) {
      throw new FileTypeError(this.config.allowedTypes);
    }
  }

  /**
   * Verifica se é arquivo de imagem
   */
  private isImage(fileType: string): boolean {
    return SUPPORTED_IMAGE_TYPES.includes(fileType as any);
  }

  /**
   * Verifica se chave é de arquivo de imagem
   */
  private isImageKey(fileKey: string): boolean {
    const extension = fileKey.toLowerCase().substring(fileKey.lastIndexOf('.'));
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension);
  }

  /**
   * Obtém metadados do arquivo
   */
  async getFileMetadata(fileKey: string): Promise<Record<string, string> | null> {
    try {
      if (!this.env.R2_BUCKET) {
        return null;
      }

      const object = await this.env.R2_BUCKET.head(fileKey);
      return object?.customMetadata || null;

    } catch (error) {
      console.error('Error getting file metadata:', error);
      return null;
    }
  }

  /**
   * Health check do serviço R2
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    try {
      if (!this.env.R2_BUCKET) {
        return { status: 'unhealthy', details: 'R2 bucket binding not found' };
      }

      // Tentar listar arquivos como teste
      await this.env.R2_BUCKET.list({ limit: 1 });

      return { status: 'healthy' };

    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}