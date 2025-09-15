/**
 * Serviço de upload e gerenciamento de imagens
 * Integração com Cloudflare R2 para armazenamento
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Env } from '../config/types/common';
import sharp from 'sharp';

export interface ImageUploadOptions {
  quality?: number;
  width?: number;
  height?: number;
  format?: 'jpeg' | 'webp' | 'png';
  generateThumbnail?: boolean;
  watermark?: boolean;
}

export interface UploadedImage {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  url: string;
  thumbnailUrl?: string;
  folder: string;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface ImageProcessingResult {
  original: UploadedImage;
  thumbnail?: UploadedImage;
  variants?: UploadedImage[];
}

export class ImageUploadService {
  private r2Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(env: Env) {
    this.bucketName = env.CLOUDFLARE_BUCKET_NAME;
    this.publicUrl = env.CLOUDFLARE_PUBLIC_URL;

    this.r2Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.CLOUDFLARE_ACCESS_KEY_ID,
        secretAccessKey: env.CLOUDFLARE_SECRET_ACCESS_KEY,
      },
    });

    console.log('🖼️ ImageUploadService initialized with R2');
  }

  /**
   * Fazer upload de uma imagem com processamento
   */
  async uploadImage(
    file: File | Buffer,
    options: ImageUploadOptions & {
      folder?: string;
      filename?: string;
      userId: string;
      userName: string;
    }
  ): Promise<ImageProcessingResult> {
    try {
      console.log('📤 Starting image upload and processing...');

      const {
        folder = 'articles',
        filename,
        userId,
        userName,
        quality = 85,
        width,
        height,
        format = 'webp',
        generateThumbnail = true,
        watermark = false
      } = options;

      // Processar buffer da imagem
      let imageBuffer: Buffer;
      let originalName: string;
      let mimeType: string;

      if (file instanceof File) {
        imageBuffer = Buffer.from(await file.arrayBuffer());
        originalName = file.name;
        mimeType = file.type;
      } else {
        imageBuffer = file;
        originalName = filename || 'uploaded-image';
        mimeType = 'image/jpeg'; // Default
      }

      // Validar tipo de arquivo
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(mimeType)) {
        throw new Error('Tipo de arquivo não suportado. Use JPEG, PNG ou WebP.');
      }

      // Obter metadados da imagem
      const imageInfo = await sharp(imageBuffer).metadata();
      
      if (!imageInfo.width || !imageInfo.height) {
        throw new Error('Não foi possível obter dimensões da imagem');
      }

      // Gerar nome único
      const timestamp = Date.now();
      const uniqueId = `${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
      const extension = format === 'jpeg' ? 'jpg' : format;
      const processedFilename = filename || `image_${uniqueId}.${extension}`;

      // Processar imagem principal
      let processedImage = sharp(imageBuffer);

      // Redimensionar se necessário
      if (width || height) {
        processedImage = processedImage.resize(width, height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      // Aplicar watermark se solicitado
      if (watermark) {
        // TODO: Implementar watermark customizado
        console.log('⚠️ Watermark requested but not implemented yet');
      }

      // Converter para formato específico
      let finalBuffer: Buffer;
      switch (format) {
        case 'webp':
          finalBuffer = await processedImage.webp({ quality }).toBuffer();
          break;
        case 'jpeg':
          finalBuffer = await processedImage.jpeg({ quality }).toBuffer();
          break;
        case 'png':
          finalBuffer = await processedImage.png({ quality: Math.round(quality / 10) }).toBuffer();
          break;
        default:
          finalBuffer = await processedImage.toBuffer();
      }

      // Upload da imagem principal
      const mainImageKey = `${folder}/${processedFilename}`;
      const originalImage = await this.uploadToR2(
        mainImageKey,
        finalBuffer,
        `image/${format}`,
        {
          originalName,
          uploadedBy: userId,
          userName,
          width: imageInfo.width,
          height: imageInfo.height,
        }
      );

      const result: ImageProcessingResult = { original: originalImage };

      // Gerar thumbnail se solicitado
      if (generateThumbnail) {
        const thumbnailBuffer = await sharp(imageBuffer)
          .resize(300, 200, { fit: 'cover', position: 'center' })
          .webp({ quality: 80 })
          .toBuffer();

        const thumbnailKey = `${folder}/thumbnails/thumb_${uniqueId}.webp`;
        const thumbnail = await this.uploadToR2(
          thumbnailKey,
          thumbnailBuffer,
          'image/webp',
          {
            originalName: `thumb_${originalName}`,
            uploadedBy: userId,
            userName,
            width: 300,
            height: 200,
          }
        );

        result.thumbnail = thumbnail;
        result.original.thumbnailUrl = thumbnail.url;
      }

      // Gerar variações responsivas
      if (imageInfo.width && imageInfo.width > 800) {
        const variants: UploadedImage[] = [];
        const sizes = [800, 600, 400];

        for (const size of sizes) {
          if (size < imageInfo.width) {
            const variantBuffer = await sharp(imageBuffer)
              .resize(size, null, { withoutEnlargement: true })
              .webp({ quality })
              .toBuffer();

            const variantKey = `${folder}/variants/${size}w_${uniqueId}.webp`;
            const variant = await this.uploadToR2(
              variantKey,
              variantBuffer,
              'image/webp',
              {
                originalName: `${size}w_${originalName}`,
                uploadedBy: userId,
                userName,
                width: size,
                height: Math.round((size / imageInfo.width) * imageInfo.height),
              }
            );

            variants.push(variant);
          }
        }

        if (variants.length > 0) {
          result.variants = variants;
        }
      }

      console.log(`✅ Image uploaded successfully: ${originalImage.url}`);
      return result;

    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error(`Falha no upload: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Upload direto para R2
   */
  private async uploadToR2(
    key: string,
    buffer: Buffer,
    contentType: string,
    metadata: {
      originalName: string;
      uploadedBy: string;
      userName: string;
      width: number;
      height: number;
    }
  ): Promise<UploadedImage> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        Metadata: {
          'original-name': metadata.originalName,
          'uploaded-by': metadata.uploadedBy,
          'uploaded-by-name': metadata.userName,
          'width': metadata.width.toString(),
          'height': metadata.height.toString(),
          'uploaded-at': new Date().toISOString(),
        },
      });

      await this.r2Client.send(command);

      // Construir URL pública
      const url = `${this.publicUrl}/${key}`;

      return {
        id: key,
        filename: key.split('/').pop() || key,
        originalName: metadata.originalName,
        mimeType: contentType,
        size: buffer.length,
        width: metadata.width,
        height: metadata.height,
        url,
        folder: key.split('/')[0],
        uploadedAt: new Date(),
        uploadedBy: metadata.uploadedBy,
      };

    } catch (error) {
      console.error('Error uploading to R2:', error);
      throw error;
    }
  }

  /**
   * Deletar imagem do R2
   */
  async deleteImage(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.r2Client.send(command);
      console.log(`🗑️ Image deleted: ${key}`);
      return true;

    } catch (error) {
      console.error('Error deleting image:', error);
      return false;
    }
  }

  /**
   * Listar imagens de uma pasta
   */
  async listImages(
    folder: string = 'articles',
    options: {
      limit?: number;
      continuationToken?: string;
    } = {}
  ): Promise<{
    images: UploadedImage[];
    nextToken?: string;
    hasMore: boolean;
  }> {
    try {
      const { limit = 50, continuationToken } = options;

      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: folder + '/',
        MaxKeys: limit,
        ContinuationToken: continuationToken,
      });

      const response = await this.r2Client.send(command);

      const images: UploadedImage[] = [];

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key && obj.Size && obj.LastModified) {
            // Obter metadados
            try {
              const headCommand = new GetObjectCommand({
                Bucket: this.bucketName,
                Key: obj.Key,
              });
              
              const headResponse = await this.r2Client.send(headCommand);

              images.push({
                id: obj.Key,
                filename: obj.Key.split('/').pop() || obj.Key,
                originalName: headResponse.Metadata?.['original-name'] || obj.Key,
                mimeType: headResponse.ContentType || 'image/jpeg',
                size: obj.Size,
                width: parseInt(headResponse.Metadata?.['width'] || '0'),
                height: parseInt(headResponse.Metadata?.['height'] || '0'),
                url: `${this.publicUrl}/${obj.Key}`,
                folder: obj.Key.split('/')[0],
                uploadedAt: obj.LastModified,
                uploadedBy: headResponse.Metadata?.['uploaded-by'] || 'unknown',
              });
            } catch (metaError) {
              // Se não conseguir obter metadados, adicionar com dados básicos
              images.push({
                id: obj.Key,
                filename: obj.Key.split('/').pop() || obj.Key,
                originalName: obj.Key,
                mimeType: 'image/jpeg',
                size: obj.Size,
                width: 0,
                height: 0,
                url: `${this.publicUrl}/${obj.Key}`,
                folder: obj.Key.split('/')[0],
                uploadedAt: obj.LastModified,
                uploadedBy: 'unknown',
              });
            }
          }
        }
      }

      return {
        images,
        nextToken: response.NextContinuationToken,
        hasMore: !!response.IsTruncated,
      };

    } catch (error) {
      console.error('Error listing images:', error);
      return { images: [], hasMore: false };
    }
  }

  /**
   * Gerar URL pré-assinada para upload direto
   */
  async generateUploadUrl(
    key: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: contentType,
      });

      const url = await getSignedUrl(this.r2Client, command, { expiresIn });
      return url;

    } catch (error) {
      console.error('Error generating upload URL:', error);
      throw error;
    }
  }

  /**
   * Otimizar imagem existente
   */
  async optimizeExistingImage(
    key: string,
    options: ImageUploadOptions = {}
  ): Promise<UploadedImage | null> {
    try {
      // Baixar imagem existente
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.r2Client.send(getCommand);
      
      if (!response.Body) {
        throw new Error('Imagem não encontrada');
      }

      // Converter stream para buffer
      const chunks: Uint8Array[] = [];
      const reader = response.Body as ReadableStream;
      const readerObj = reader.getReader();

      try {
        while (true) {
          const { done, value } = await readerObj.read();
          if (done) break;
          chunks.push(value);
        }
      } finally {
        readerObj.releaseLock();
      }

      const imageBuffer = Buffer.concat(chunks);

      // Reprocessar com novas opções
      const metadata = response.Metadata || {};
      const result = await this.uploadImage(imageBuffer, {
        ...options,
        folder: key.split('/')[0],
        filename: key.split('/').pop(),
        userId: metadata['uploaded-by'] || 'system',
        userName: metadata['uploaded-by-name'] || 'System',
      });

      return result.original;

    } catch (error) {
      console.error('Error optimizing image:', error);
      return null;
    }
  }

  /**
   * Limpar imagens antigas (cleanup job)
   */
  async cleanupOldImages(
    folder: string = 'temp',
    olderThanDays: number = 7
  ): Promise<{ deleted: number; errors: string[] }> {
    try {
      console.log(`🧹 Starting cleanup of images older than ${olderThanDays} days in ${folder}/`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const { images } = await this.listImages(folder, { limit: 1000 });

      let deleted = 0;
      const errors: string[] = [];

      for (const image of images) {
        if (image.uploadedAt < cutoffDate) {
          try {
            const success = await this.deleteImage(image.id);
            if (success) {
              deleted++;
            } else {
              errors.push(`Failed to delete ${image.id}`);
            }
          } catch (error) {
            errors.push(`Error deleting ${image.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      console.log(`✅ Cleanup completed: ${deleted} images deleted, ${errors.length} errors`);
      return { deleted, errors };

    } catch (error) {
      console.error('Error in cleanup process:', error);
      return { deleted: 0, errors: ['Cleanup process failed'] };
    }
  }
}