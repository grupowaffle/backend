// Slug generation service interface (Single Responsibility Principle)
export interface ISlugService {
  generateSlug(title: string): string;
}

export class SlugService implements ISlugService {
  generateSlug(title: string): string {
    return title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .trim()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Remove multiple consecutive hyphens
      .substring(0, 100); // Limit length
  }
}