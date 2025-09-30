// Slug generation interface (Single Responsibility Principle)
export interface ISlugGenerator {
  generate(text: string): string;
  generateUnique(baseSlug: string, checkExists: (slug: string) => Promise<boolean>): Promise<string>;
}

export class SlugGenerator implements ISlugGenerator {
  generate(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  async generateUnique(
    baseSlug: string,
    checkExists: (slug: string) => Promise<boolean>
  ): Promise<string> {
    // Check if base slug is available
    const exists = await checkExists(baseSlug);
    if (!exists) {
      return baseSlug;
    }

    // Generate unique slug with timestamp
    let counter = 1;
    let uniqueSlug = `${baseSlug}-${Date.now()}`;

    // Fallback: try with incremental counter
    while (await checkExists(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${counter++}`;
      if (counter > 100) break; // Safety valve
    }

    return uniqueSlug;
  }
}