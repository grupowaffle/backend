import { DatabaseType } from '../repositories/BaseRepository';
import { authors } from '../config/db/schema';
import { eq } from 'drizzle-orm';
import { generateId } from '../lib/cuid';

export class AuthorSyncService {
  constructor(private db: DatabaseType) {}

  /**
   * Ensure an author record exists for a user
   * Creates one if it doesn't exist, updates if it does
   */
  async ensureAuthorForUser(userId: string, userData?: any): Promise<string | null> {
    try {
      console.log('🔍 [AUTHOR SYNC] === INÍCIO DA SINCRONIZAÇÃO ===');
      console.log('🔍 [AUTHOR SYNC] UserId:', userId);
      console.log('🔍 [AUTHOR SYNC] UserData completo:', JSON.stringify(userData, null, 2));
      console.log('🔍 [AUTHOR SYNC] Campos específicos:', {
        name: userData.name,
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email
      });
      
      // If userData is not provided, we can't create an author
      if (!userData) {
        console.error(`❌ [AUTHOR SYNC] User data not provided for userId: ${userId}`);
        return null;
      }

      // Check if author already exists for this user
      console.log('🔍 [AUTHOR SYNC] Buscando autor existente com email:', userData.email);
      const existingAuthor = await this.db
        .select()
        .from(authors)
        .where(eq(authors.email, userData.email))
        .limit(1);
      
      console.log('🔍 [AUTHOR SYNC] Autor existente encontrado:', existingAuthor[0] ? { 
        id: existingAuthor[0].id, 
        name: existingAuthor[0].name,
        email: existingAuthor[0].email 
      } : 'Nenhum');

      if (existingAuthor[0]) {
        console.log('🔄 [AUTHOR SYNC] Atualizando autor existente:', existingAuthor[0].id);
        
        // Generate a better name if userData doesn't have name
        let authorName = userData.name;
        if (!authorName) {
        // Try to construct name from email or use a more descriptive name
        if (userData.email && userData.email.includes('@')) {
          const emailName = userData.email.split('@')[0];
          // Clean up the name: remove dots, replace with spaces, capitalize
          authorName = emailName
            .replace(/\./g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        } else {
          authorName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Usuário';
        }
        }
        
        console.log('🔍 [AUTHOR SYNC] Nome do autor a usar:', authorName);
        
        // Update author with latest user data
        await this.db
          .update(authors)
          .set({
            name: authorName,
            avatar: userData.avatar,
            bio: userData.bio,
            updatedAt: new Date(),
          })
          .where(eq(authors.id, existingAuthor[0].id));

        console.log('✅ [AUTHOR SYNC] Autor atualizado com sucesso:', existingAuthor[0].id);
        return existingAuthor[0].id;
      }

      // Create new author record
      console.log('🆕 [AUTHOR SYNC] Criando novo autor...');
      const authorId = generateId();
      
      // Generate a better name if userData doesn't have name
      let authorName = userData.name;
      if (!authorName) {
        // Try to construct name from email or use a more descriptive name
        if (userData.email && userData.email.includes('@')) {
          const emailName = userData.email.split('@')[0];
          // Clean up the name: remove dots, replace with spaces, capitalize
          authorName = emailName
            .replace(/\./g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        } else {
          authorName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Usuário';
        }
      }
      
      const authorSlug = this.generateAuthorSlug(userData.email || authorId);

      console.log('🔍 [AUTHOR SYNC] Dados do autor a criar:', {
        id: authorId,
        name: authorName,
        slug: authorSlug,
        email: userData.email
      });

      await this.db.insert(authors).values({
        id: authorId,
        name: authorName,
        slug: authorSlug,
        email: userData.email,
        bio: userData.bio,
        avatar: userData.avatar,
        isActive: true,
        featuredAuthor: false,
        articleCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`✅ [AUTHOR SYNC] Autor criado com sucesso para user ${userId}: ${authorName} (ID: ${authorId})`);
      return authorId;
    } catch (error) {
      console.error('Error ensuring author for user:', error);
      return null;
    }
  }

  /**
   * Sync all users to authors table - REMOVED
   * Users are now managed in D1, not Neon
   */

  /**
   * Generate a unique slug for an author
   */
  private generateAuthorSlug(baseSlug: string): string {
    // Extract username from email if it's an email
    if (baseSlug.includes('@')) {
      baseSlug = baseSlug.split('@')[0];
    }

    return baseSlug
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
      .replace(/-+/g, '-') // Remove multiple consecutive hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50); // Limit length
  }

  /**
   * Get author ID for a user - REMOVED
   * Users are now managed in D1, use ensureAuthorForUser with user data
   */
}