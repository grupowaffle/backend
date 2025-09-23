import { DrizzleClient } from '../config/db';
import { authors, users } from '../config/db/schema';
import { eq } from 'drizzle-orm';
import { generateId } from '../lib/cuid';

export class AuthorSyncService {
  constructor(private db: DrizzleClient) {}

  /**
   * Ensure an author record exists for a user
   * Creates one if it doesn't exist, updates if it does
   */
  async ensureAuthorForUser(userId: string): Promise<string | null> {
    try {
      // First check if user exists
      const user = await this.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user[0]) {
        console.error(`User not found: ${userId}`);
        return null;
      }

      const userData = user[0];

      // Check if author already exists for this user
      const existingAuthor = await this.db
        .select()
        .from(authors)
        .where(eq(authors.email, userData.email))
        .limit(1);

      if (existingAuthor[0]) {
        // Update author with latest user data
        await this.db
          .update(authors)
          .set({
            name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Autor',
            avatar: userData.avatar,
            bio: userData.bio,
            updatedAt: new Date(),
          })
          .where(eq(authors.id, existingAuthor[0].id));

        return existingAuthor[0].id;
      }

      // Create new author record
      const authorId = generateId();
      const authorName = userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Autor';
      const authorSlug = this.generateAuthorSlug(userData.email || authorId);

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

      console.log(`✅ Created author record for user ${userId}: ${authorName}`);
      return authorId;
    } catch (error) {
      console.error('Error ensuring author for user:', error);
      return null;
    }
  }

  /**
   * Sync all users to authors table
   * Useful for migration or batch sync
   */
  async syncAllUsers(): Promise<{ synced: number; errors: number }> {
    let synced = 0;
    let errors = 0;

    try {
      const allUsers = await this.db.select().from(users);

      for (const user of allUsers) {
        const result = await this.ensureAuthorForUser(user.id.toString());
        if (result) {
          synced++;
        } else {
          errors++;
        }
      }

      console.log(`✅ Sync complete: ${synced} synced, ${errors} errors`);
      return { synced, errors };
    } catch (error) {
      console.error('Error syncing all users:', error);
      return { synced, errors };
    }
  }

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
   * Get author ID for a user, creating if necessary
   */
  async getAuthorIdForUser(userId: string): Promise<string | null> {
    // First try to find existing author by user email
    const user = await this.db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user[0]) {
      return null;
    }

    const existingAuthor = await this.db
      .select()
      .from(authors)
      .where(eq(authors.email, user[0].email))
      .limit(1);

    if (existingAuthor[0]) {
      return existingAuthor[0].id;
    }

    // If no author exists, create one
    return this.ensureAuthorForUser(userId);
  }
}