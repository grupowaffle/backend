/**
 * Serviço R2 simplificado seguindo padrão do projeto waffle
 */

import { Env } from '../config/types/common';
import { generateId } from '../lib/cuid';

export class R2Service {
  private env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  /**
   * Upload arquivo para R2 (seguindo padrão waffle)
   */
  async uploadToR2(file: File, fileName: string): Promise<string> {
    const key = `uploads/${Date.now()}-${fileName}`;

    await this.env.FILE_STORAGE.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type
      }
    });

    // Retorna URL pública via Worker (sem exposição direta do bucket)
    return `/api/cms/media/serve/${key}`;
  }

  /**
   * Upload de buffer/arrayBuffer para R2
   */
  async uploadBufferToR2(
    buffer: ArrayBuffer, 
    fileName: string, 
    contentType: string,
    module: string = 'general'
  ): Promise<string> {
    const key = `${module}/${Date.now()}-${generateId()}-${fileName}`;

    await this.env.FILE_STORAGE.put(key, buffer, {
      httpMetadata: {
        contentType: contentType
      }
    });

    // Retorna URL pública via Worker (sem exposição direta do bucket)
    return `/api/cms/media/serve/${key}`;
  }

  /**
   * Upload para assets bucket
   */
  async uploadToAssets(file: File, fileName: string): Promise<string> {
    const key = `assets/${Date.now()}-${fileName}`;

    await this.env.ASSETS.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type
      }
    });

    return `/api/cms/media/serve/${key}`;
  }

  /**
   * Deletar arquivo do R2
   */
  async deleteFromR2(key: string): Promise<boolean> {
    try {
      await this.env.FILE_STORAGE.delete(key);
      return true;
    } catch (error) {
      console.error('Error deleting from R2:', error);
      return false;
    }
  }

  /**
   * Verificar se arquivo existe no R2
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const object = await this.env.FILE_STORAGE.head(key);
      return object !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Obter arquivo do R2 (para servir via Worker se necessário)
   */
  async getFileFromR2(key: string): Promise<R2Object | null> {
    try {
      return await this.env.FILE_STORAGE.get(key);
    } catch (error) {
      console.error('Error getting file from R2:', error);
      return null;
    }
  }

  /**
   * Listar arquivos no R2
   */
  async listFiles(prefix?: string, limit: number = 100): Promise<string[]> {
    try {
      const objects = await this.env.FILE_STORAGE.list({
        prefix,
        limit
      });

      return objects.objects.map(obj => obj.key);
    } catch (error) {
      console.error('Error listing files from R2:', error);
      return [];
    }
  }

  /**
   * Health check do R2
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details?: string }> {
    try {
      // Testar conexão listando um arquivo
      await this.env.FILE_STORAGE.list({ limit: 1 });
      return { status: 'healthy' };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        details: error instanceof Error ? error.message : 'R2 connection failed' 
      };
    }
  }

  /**
   * Gerar chave única para upload
   */
  generateUploadKey(fileName: string, module: string = 'uploads'): string {
    const timestamp = Date.now();
    const id = generateId();
    const extension = fileName.substring(fileName.lastIndexOf('.'));
    
    return `${module}/${timestamp}-${id}${extension}`;
  }
}