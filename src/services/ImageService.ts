import { getDrizzleClient } from '../config/db';
import { media } from '../config/db/schema';
import { generateId } from '../lib/cuid';
import { Env } from '../config/types/common';

export interface UploadImageOptions {
  alt?: string;
  title?: string;
  folder?: string;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface ImageMetadata {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  url: string;
  alt?: string;
  title?: string;
  folder?: string;
  uploadedAt: Date;
}

export class ImageService {
  private env: Env;
  private db: ReturnType<typeof getDrizzleClient>;
  private r2: R2Bucket;

  constructor(env: Env) {
    this.env = env;
    this.db = getDrizzleClient(env);
    this.r2 = env.MEDIA_BUCKET || env.FILE_STORAGE; // R2 bucket binding
  }

  /**
   * Upload and store image in Cloudflare R2 + metadata in Neon
   */
  async uploadImage(
    file: File,
    options: UploadImageOptions = {}
  ): Promise<ImageMetadata> {
    try {
      console.log('🖼️ Starting image upload to R2:', file.name);

      // Validate file
      this.validateImageFile(file);

      // Generate unique filename and key
      const fileExtension = this.getFileExtension(file.name);
      const filename = `${generateId()}.${fileExtension}`;
      const r2Key = `images/${filename}`;
      
      // Read file as buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Get image dimensions (basic validation)
      const dimensions = await this.getImageDimensions(buffer, file.type);

      // Optimize image if needed
      const optimizedBuffer = await this.optimizeImage(buffer, {
        maxWidth: options.maxWidth || 1920,
        maxHeight: options.maxHeight || 1080,
        quality: options.quality || 85,
        mimeType: file.type,
      });

      // Upload to R2
      console.log('☁️ Uploading to Cloudflare R2...');
      await this.r2.put(r2Key, optimizedBuffer, {
        httpMetadata: {
          contentType: file.type,
          cacheControl: 'public, max-age=31536000', // Cache for 1 year
        },
        customMetadata: {
          originalName: file.name,
          uploadedBy: 'cms-system',
        },
      });

      // Generate public URL (fallback to R2 direct URL if no custom domain)
      const publicUrl = this.env.R2_DOMAIN ? 
        `https://${this.env.R2_DOMAIN}/${r2Key}` : 
        r2Key; // Will be updated with actual R2 URL when configured
      
      // Store metadata in Neon database
      console.log('💾 Storing metadata in Neon database...');
      const [savedMedia] = await this.db
        .insert(media)
        .values({
          id: generateId(),
          filename,
          originalName: file.name,
          mimeType: file.type,
          size: optimizedBuffer.length,
          width: dimensions.width,
          height: dimensions.height,
          url: publicUrl,
          storagePath: r2Key, // Store R2 key for deletion
          alt: options.alt || '',
          title: options.title || file.name,
          folder: options.folder || 'general',
          isActive: true,
          createdAt: new Date(),
        })
        .returning();

      console.log('✅ Image uploaded successfully to R2:', savedMedia.id);

      return {
        id: savedMedia.id,
        filename: savedMedia.filename,
        originalName: savedMedia.originalName,
        mimeType: savedMedia.mimeType,
        size: savedMedia.size,
        width: savedMedia.width || undefined,
        height: savedMedia.height || undefined,
        url: savedMedia.url,
        alt: savedMedia.alt || undefined,
        title: savedMedia.title || undefined,
        folder: savedMedia.folder || undefined,
        uploadedAt: savedMedia.createdAt,
      };
    } catch (error) {
      console.error('❌ Error uploading image:', error);
      throw new Error(`Failed to upload image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get image metadata by ID
   */
  async getImageMetadata(id: string): Promise<ImageMetadata | null> {
    try {
      const result = await this.db
        .select({
          id: media.id,
          filename: media.filename,
          originalName: media.originalName,
          mimeType: media.mimeType,
          size: media.size,
          width: media.width,
          height: media.height,
          url: media.url,
          alt: media.alt,
          title: media.title,
          folder: media.folder,
          createdAt: media.createdAt,
        })
        .from(media)
        .where(media.id.eq(id).and(media.isActive.eq(true)))
        .limit(1);

      if (!result[0]) {
        return null;
      }

      const img = result[0];
      return {
        id: img.id,
        filename: img.filename,
        originalName: img.originalName,
        mimeType: img.mimeType,
        size: img.size,
        width: img.width || undefined,
        height: img.height || undefined,
        url: img.url,
        alt: img.alt || undefined,
        title: img.title || undefined,
        category: img.folder || undefined,
        uploadedAt: img.createdAt,
      };
    } catch (error) {
      console.error('❌ Error getting image metadata:', error);
      return null;
    }
  }

  /**
   * List images with pagination
   */
  async listImages(options: {
    page?: number;
    limit?: number;
    folder?: string;
  } = {}): Promise<{
    images: ImageMetadata[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const page = Math.max(1, options.page || 1);
      const limit = Math.min(50, Math.max(1, options.limit || 20));
      const offset = (page - 1) * limit;

      let query = this.db
        .select({
          id: media.id,
          filename: media.filename,
          originalName: media.originalName,
          mimeType: media.mimeType,
          size: media.size,
          width: media.width,
          height: media.height,
          url: media.url,
          alt: media.alt,
          title: media.title,
          folder: media.folder,
          createdAt: media.createdAt,
        })
        .from(media)
        .where(media.isActive.eq(true));

      if (options.folder) {
        query = query.where(media.folder.eq(options.folder));
      }

      const images = await query
        .orderBy(media.createdAt.desc())
        .limit(limit)
        .offset(offset);

      // Get total count
      const [{ count }] = await this.db
        .select({ count: media.id.count() })
        .from(media)
        .where(media.isActive.eq(true));

      const total = count;
      const totalPages = Math.ceil(total / limit);

      return {
        images: images.map(img => ({
          id: img.id,
          filename: img.filename,
          originalName: img.originalName,
          mimeType: img.mimeType,
          size: img.size,
          width: img.width || undefined,
          height: img.height || undefined,
          url: img.url, // URL do R2
          alt: img.alt || undefined,
          title: img.title || undefined,
          category: img.folder || undefined,
          uploadedAt: img.createdAt,
        })),
        total,
        page,
        totalPages,
      };
    } catch (error) {
      console.error('❌ Error listing images:', error);
      throw new Error('Failed to list images');
    }
  }

  /**
   * Delete image from R2 and mark as inactive in database
   */
  async deleteImage(id: string): Promise<boolean> {
    try {
      // First get the R2 key from storagePath
      const imageData = await this.db
        .select({
          storagePath: media.storagePath,
          filename: media.filename,
        })
        .from(media)
        .where(media.id.eq(id).and(media.isActive.eq(true)))
        .limit(1);

      if (!imageData[0] || !imageData[0].storagePath) {
        console.log('❌ Image not found or no storage path:', id);
        return false;
      }

      const { storagePath: r2Key, filename } = imageData[0];

      // Delete from R2
      console.log('🗑️ Deleting from R2:', r2Key);
      try {
        await this.r2.delete(r2Key);
        console.log('✅ Deleted from R2:', filename);
      } catch (r2Error) {
        console.error('❌ Error deleting from R2:', r2Error);
        // Continue with database deletion even if R2 deletion fails
      }

      // Mark as inactive in database
      const result = await this.db
        .update(media)
        .set({ 
          isActive: false,
          updatedAt: new Date(),
        })
        .where(media.id.eq(id))
        .returning({ id: media.id });

      const success = result.length > 0;
      if (success) {
        console.log('✅ Image marked as deleted:', id);
      }

      return success;
    } catch (error) {
      console.error('❌ Error deleting image:', error);
      return false;
    }
  }

  private validateImageFile(file: File): void {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Invalid file type: ${file.type}. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // 10MB limit
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error(`File too large: ${file.size} bytes. Maximum size: ${maxSize} bytes`);
    }
  }

  private getFileExtension(filename: string): string {
    return filename.split('.').pop()?.toLowerCase() || 'jpg';
  }

  private async getImageDimensions(buffer: Buffer, mimeType: string): Promise<{
    width: number;
    height: number;
  }> {
    // Basic dimension detection for common formats
    // For production, you might want to use a proper image processing library
    try {
      if (mimeType === 'image/png') {
        // PNG format: width and height are at bytes 16-19 and 20-23
        if (buffer.length >= 24) {
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return { width, height };
        }
      } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        // Basic JPEG parsing - simplified
        // In production, use a proper image library like sharp
        return { width: 0, height: 0 }; // Placeholder
      }
      
      return { width: 0, height: 0 };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  private async optimizeImage(buffer: Buffer, options: {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    mimeType: string;
  }): Promise<Buffer> {
    // For now, return original buffer
    // In production, implement image optimization using sharp or similar library
    console.log('📐 Image optimization placeholder - returning original buffer');
    return buffer;
  }
}