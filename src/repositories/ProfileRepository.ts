import { BaseRepository, DatabaseType } from './BaseRepository';
import { profiles, Profile, NewProfile } from '../config/db/schema';
import { eq, desc, and, or, sql } from 'drizzle-orm';
import { generateId } from '../lib/cuid';

export class ProfileRepository extends BaseRepository {
  constructor(db: DatabaseType) {
    super(db);
  }

  async getAll(): Promise<Profile[]> {
    try {
      const result = await (this.db as any)
        .select()
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .orderBy(desc(profiles.createdAt));

      return result;
    } catch (error) {
      this.handleError(error, 'get all profiles');
      throw error;
    }
  }

  async getById(id: string): Promise<Profile | null> {
    try {
      const [result] = await (this.db as any)
        .select()
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);

      return result || null;
    } catch (error) {
      this.handleError(error, 'get profile by id');
      throw error;
    }
  }

  async getByRole(role: string): Promise<Profile | null> {
    try {
      const [result] = await (this.db as any)
        .select()
        .from(profiles)
        .where(and(eq(profiles.role, role), eq(profiles.isActive, true)))
        .limit(1);

      return result || null;
    } catch (error) {
      this.handleError(error, 'get profile by role');
      throw error;
    }
  }

  async create(data: Omit<NewProfile, 'id' | 'createdAt' | 'updatedAt'>): Promise<Profile> {
    try {
      const [result] = await (this.db as any)
        .insert(profiles)
        .values({
          id: generateId(),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return result;
    } catch (error) {
      this.handleError(error, 'create profile');
      throw error;
    }
  }

  async update(id: string, data: Partial<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Profile> {
    try {
      const [result] = await (this.db as any)
        .update(profiles)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, id))
        .returning();

      if (!result) {
        throw new Error('Profile not found');
      }

      return result;
    } catch (error) {
      this.handleError(error, 'update profile');
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      // Soft delete - marcar como inativo
      await (this.db as any)
        .update(profiles)
        .set({
          isActive: false,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, id));

      return true;
    } catch (error) {
      this.handleError(error, 'delete profile');
      throw error;
    }
  }

  async hardDelete(id: string): Promise<boolean> {
    try {
      await (this.db as any)
        .delete(profiles)
        .where(eq(profiles.id, id));

      return true;
    } catch (error) {
      this.handleError(error, 'hard delete profile');
      throw error;
    }
  }

  async getByUserRole(userRole: string): Promise<Profile | null> {
    try {
      // Buscar perfil que corresponde ao role do usuário
      const [result] = await (this.db as any)
        .select()
        .from(profiles)
        .where(and(eq(profiles.role, userRole), eq(profiles.isActive, true)))
        .limit(1);

      return result || null;
    } catch (error) {
      this.handleError(error, 'get profile by user role');
      throw error;
    }
  }

  async getDefaultProfiles(): Promise<Profile[]> {
    try {
      const result = await (this.db as any)
        .select()
        .from(profiles)
        .where(and(eq(profiles.isDefault, true), eq(profiles.isActive, true)))
        .orderBy(desc(profiles.createdAt));

      return result;
    } catch (error) {
      this.handleError(error, 'get default profiles');
      throw error;
    }
  }

  async searchProfiles(searchTerm: string): Promise<Profile[]> {
    try {
      const result = await (this.db as any)
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.isActive, true),
            or(
              sql`LOWER(${profiles.name}) LIKE LOWER(${'%' + searchTerm + '%'})`,
              sql`LOWER(${profiles.description}) LIKE LOWER(${'%' + searchTerm + '%'})`,
              sql`LOWER(${profiles.role}) LIKE LOWER(${'%' + searchTerm + '%'})`
            )
          )
        )
        .orderBy(desc(profiles.createdAt));

      return result;
    } catch (error) {
      this.handleError(error, 'search profiles');
      throw error;
    }
  }

  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRole: Record<string, number>;
  }> {
    try {
      const totalResult = await (this.db as any)
        .select({ count: sql<number>`count(*)` })
        .from(profiles);

      const activeResult = await (this.db as any)
        .select({ count: sql<number>`count(*)` })
        .from(profiles)
        .where(eq(profiles.isActive, true));

      const inactiveResult = await (this.db as any)
        .select({ count: sql<number>`count(*)` })
        .from(profiles)
        .where(eq(profiles.isActive, false));

      const byRoleResult = await (this.db as any)
        .select({
          role: profiles.role,
          count: sql<number>`count(*)`
        })
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .groupBy(profiles.role);

      const byRoleMap = byRoleResult.reduce((acc: Record<string, number>, item: any) => {
        acc[item.role] = item.count;
        return acc;
      }, {});

      return {
        total: totalResult[0]?.count || 0,
        active: activeResult[0]?.count || 0,
        inactive: inactiveResult[0]?.count || 0,
        byRole: byRoleMap,
      };
    } catch (error) {
      this.handleError(error, 'get profiles stats');
      throw error;
    }
  }
}
