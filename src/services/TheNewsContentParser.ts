/**
 * Parser específico para o The News
 * Extrai seções estruturadas do RSS do BeehIV
 */

import { ContentBlock, ParsedContent } from './ContentParser';

export interface TheNewsSection {
  id: string;
  category: 'MUNDO' | 'BRASIL' | 'TECNOLOGIA' | 'ECONOMIA' | 'VARIEDADES' | 'APRESENTADO_POR' | 'OUTROS';
  title: string;
  content: string;
  images: string[];
  isSponsored: boolean;
}

export class TheNewsContentParser {
  private blockIdCounter = 0;

  /**
   * Parse RSS específico do The News em seções estruturadas
   */
  parseTheNewsContent(rssContent: string): {
    sections: TheNewsSection[];
    blocks: ContentBlock[];
    metadata: ParsedContent['metadata'];
  } {
    try {
      console.log('🗞️ Parsing The News content...');

      // Remove estilos BeehIV
      const cleanHtml = this.cleanBeehiivHtml(rssContent);

      // Extrai seções específicas do The News
      const sections = this.extractTheNewsSections(cleanHtml);

      // Converte para blocos de conteúdo
      const blocks = this.sectionsToBlocks(sections);

      // Calcula metadados
      const metadata = this.calculateMetadata(blocks);

      console.log(`✅ The News parsing completed: ${sections.length} sections, ${blocks.length} blocks`);

      return {
        sections,
        blocks,
        metadata
      };

    } catch (error) {
      console.error('❌ Error parsing The News content:', error);

      // Fallback para conteúdo mínimo
      return {
        sections: [],
        blocks: [{
          id: this.generateBlockId(),
          type: 'paragraph',
          data: { text: 'Erro no processamento do conteúdo' }
        }],
        metadata: {
          wordCount: 0,
          readingTime: 1,
          hasImages: false,
          hasSections: false
        }
      };
    }
  }

  /**
   * Remove classes e estilos específicos do BeehIV
   */
  private cleanBeehiivHtml(html: string): string {
    return html
      // Remove estilos
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')

      // Remove tracking pixels
      .replace(/<div class="custom_html">[\s\S]*?<\/div>/gi, '')

      // Remove classes BeehIV
      .replace(/class="beehiiv[^"]*"/gi, '')
      .replace(/class="image[^"]*"/gi, '')
      .replace(/class="paragraph[^"]*"/gi, '')
      .replace(/class="heading[^"]*"/gi, '')
      .replace(/class="blockquote[^"]*"/gi, '')

      // Simplifica IDs
      .replace(/id="[^"]*"/gi, '')

      // Normaliza whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extrai seções específicas do The News
   */
  private extractTheNewsSections(html: string): TheNewsSection[] {
    const sections: TheNewsSection[] = [];

    // Padrões de seções do The News
    const sectionPatterns = [
      {
        category: 'MUNDO' as const,
        pattern: /<h6[^>]*>MUNDO<\/h6>([\s\S]*?)(?=<hr|<h6|$)/gi
      },
      {
        category: 'BRASIL' as const,
        pattern: /<h6[^>]*>BRASIL<\/h6>([\s\S]*?)(?=<hr|<h6|$)/gi
      },
      {
        category: 'TECNOLOGIA' as const,
        pattern: /<h6[^>]*>TECNOLOGIA<\/h6>([\s\S]*?)(?=<hr|<h6|$)/gi
      },
      {
        category: 'ECONOMIA' as const,
        pattern: /<h6[^>]*>ECONOMIA<\/h6>([\s\S]*?)(?=<hr|<h6|$)/gi
      },
      {
        category: 'VARIEDADES' as const,
        pattern: /<h6[^>]*>VARIEDADES<\/h6>([\s\S]*?)(?=<hr|<h6|$)/gi
      },
      {
        category: 'APRESENTADO_POR' as const,
        pattern: /<h6[^>]*>APRESENTADO POR<\/h6>([\s\S]*?)(?=<hr|<h6|$)/gi
      }
    ];

    for (const { category, pattern } of sectionPatterns) {
      pattern.lastIndex = 0; // Reset regex
      let match;

      while ((match = pattern.exec(html)) !== null) {
        const sectionContent = match[1];

        // Extrai título da seção (primeira tag h1)
        const titleMatch = sectionContent.match(/<h1[^>]*>(.*?)<\/h1>/i);
        const title = titleMatch ? this.stripHtml(titleMatch[1]) : category;

        // Extrai conteúdo (parágrafos)
        const contentParagraphs = [];
        const paragraphRegex = /<p[^>]*>(.*?)<\/p>/gi;
        let pMatch;

        while ((pMatch = paragraphRegex.exec(sectionContent)) !== null) {
          const pContent = this.stripHtml(pMatch[1]).trim();
          if (pContent && !pContent.includes('COMPARTILHAR') && pContent.length > 5) {
            contentParagraphs.push(pContent);
          }
        }

        // Extrai imagens
        const images = this.extractImages(sectionContent);

        // Determina se é patrocinado
        const isSponsored = category === 'APRESENTADO_POR';

        if (title && contentParagraphs.length > 0) {
          sections.push({
            id: this.generateBlockId(),
            category,
            title,
            content: contentParagraphs.join('\n\n'),
            images,
            isSponsored
          });
        }
      }
    }

    console.log(`📰 Extracted ${sections.length} sections:`, sections.map(s => s.category));
    return sections;
  }

  /**
   * Converte seções em blocos de conteúdo
   */
  private sectionsToBlocks(sections: TheNewsSection[]): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    for (const section of sections) {
      // Adiciona heading da categoria
      blocks.push({
        id: this.generateBlockId(),
        type: 'heading',
        data: {
          text: section.category.replace('_', ' '),
          level: 6
        }
      });

      // Adiciona título da notícia
      if (section.title && section.title !== section.category) {
        blocks.push({
          id: this.generateBlockId(),
          type: 'heading',
          data: {
            text: section.title,
            level: 1
          }
        });
      }

      // Adiciona conteúdo
      if (section.content) {
        const paragraphs = section.content.split('\n\n');
        for (const paragraph of paragraphs) {
          if (paragraph.trim()) {
            blocks.push({
              id: this.generateBlockId(),
              type: 'paragraph',
              data: {
                text: paragraph.trim()
              }
            });
          }
        }
      }

      // Adiciona imagens
      for (const imageUrl of section.images) {
        blocks.push({
          id: this.generateBlockId(),
          type: 'image',
          data: {
            url: imageUrl,
            alt: `Imagem da seção ${section.category}`
          }
        });
      }

      // Adiciona divisor entre seções
      blocks.push({
        id: this.generateBlockId(),
        type: 'divider',
        data: {}
      });
    }

    return blocks;
  }

  /**
   * Extrai URLs de imagens do HTML
   */
  private extractImages(html: string): string[] {
    const images: string[] = [];
    const imageRegex = /<img[^>]+src="([^">]+)"/gi;
    let match;

    while ((match = imageRegex.exec(html)) !== null) {
      const src = match[1];
      // Filtra tracking pixels e imagens muito pequenas
      if (src &&
          !src.includes('pixel') &&
          !src.includes('tracking') &&
          !src.includes('width="1"') &&
          !src.includes('height="1"')) {
        images.push(src);
      }
    }

    return images;
  }

  /**
   * Remove tags HTML do texto
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Calcula metadados do conteúdo
   */
  private calculateMetadata(blocks: ContentBlock[]): ParsedContent['metadata'] {
    const textBlocks = blocks.filter(b => b.type === 'paragraph' || b.type === 'heading');
    const allText = textBlocks.map(b => b.data.text || '').join(' ');
    const wordCount = allText.split(/\s+/).filter(word => word.length > 0).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));
    const hasImages = blocks.some(b => b.type === 'image');
    const hasSections = blocks.some(b => b.type === 'heading');

    return {
      wordCount,
      readingTime,
      hasImages,
      hasSections
    };
  }

  /**
   * Gera ID único para blocos
   */
  private generateBlockId(): string {
    return `tn_${++this.blockIdCounter}_${Date.now()}`;
  }

  /**
   * Detecta categoria principal baseada nas seções
   */
  detectMainCategory(sections: TheNewsSection[]): string {
    // Ordena por prioridade de categorias
    const priorityOrder = ['BRASIL', 'MUNDO', 'ECONOMIA', 'TECNOLOGIA', 'VARIEDADES'];

    for (const category of priorityOrder) {
      if (sections.some(s => s.category === category && s.content.length > 100)) {
        return category.toLowerCase();
      }
    }

    return 'geral';
  }
}