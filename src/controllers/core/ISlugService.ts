// Slug generation service interface (Single Responsibility Principle)
export interface ISlugService {
  generateSlug(title: string, maxLength?: number): string;
}

export class SlugService implements ISlugService {
  private readonly DEFAULT_MAX_LENGTH = 100; // Limite padrão para SEO

  /**
   * Gera um slug otimizado para SEO a partir de um título
   * 
   * @param title - O título a ser convertido em slug
   * @param maxLength - Comprimento máximo do slug (padrão: 100 caracteres)
   * @returns Slug formatado e limitado ao tamanho máximo
   */
  generateSlug(title: string, maxLength: number = this.DEFAULT_MAX_LENGTH): string {
    // Etapa 1: Normalização básica
    let slug = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
      .trim()
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/-+/g, '-'); // Remove hífens consecutivos

    // Etapa 2: Limitar comprimento
    if (slug.length > maxLength) {
      // Cortar no último hífen antes do limite para não cortar no meio de uma palavra
      slug = slug.substring(0, maxLength);
      const lastHyphenIndex = slug.lastIndexOf('-');
      
      if (lastHyphenIndex > 0) {
        slug = slug.substring(0, lastHyphenIndex);
      }
    }

    // Etapa 3: Limpeza final - remover hífens no início ou fim
    slug = slug.replace(/^-+|-+$/g, '');

    // Garantir que o slug não está vazio
    if (slug.length === 0) {
      slug = 'untitled';
    }

    return slug;
  }
}