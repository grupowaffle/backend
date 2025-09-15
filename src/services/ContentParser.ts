/**
 * Parser avançado de conteúdo BeehIiv
 * Converte HTML/RSS em blocos estruturados para o CMS
 */

export interface ContentBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'image' | 'quote' | 'list' | 'divider' | 'section';
  data: {
    text?: string;
    level?: number;
    url?: string;
    alt?: string;
    caption?: string;
    items?: string[];
    style?: string;
    title?: string;
    content?: string;
  };
}

export interface ParsedContent {
  blocks: ContentBlock[];
  extractedImages: string[];
  sections: Array<{ title: string; content: string; blocks: ContentBlock[] }>;
  metadata: {
    wordCount: number;
    readingTime: number;
    hasImages: boolean;
    hasSections: boolean;
  };
}

export class ContentParser {
  private blockIdCounter = 0;

  /**
   * Parse BeehIiv RSS content into structured blocks
   */
  parseRssContent(rssContent: string): ParsedContent {
    try {
      console.log('🔍 Starting content parsing...');

      // Clean HTML from BeehIiv specific styles and classes
      const cleanedHtml = this.cleanBeehiivHtml(rssContent);
      
      // Extract images first
      const extractedImages = this.extractImages(cleanedHtml);
      
      // Parse into sections
      const sections = this.parseSections(cleanedHtml);
      
      // Convert to blocks
      const blocks = this.htmlToBlocks(cleanedHtml);
      
      // Calculate metadata
      const metadata = this.calculateMetadata(blocks, extractedImages);
      
      console.log(`✅ Parsing completed: ${blocks.length} blocks, ${sections.length} sections`);

      return {
        blocks,
        extractedImages,
        sections,
        metadata,
      };
    } catch (error) {
      console.error('❌ Error parsing content:', error);
      
      // Return minimal structure on error
      return {
        blocks: [{
          id: this.generateBlockId(),
          type: 'paragraph',
          data: { text: rssContent.substring(0, 500) + '...' }
        }],
        extractedImages: [],
        sections: [],
        metadata: {
          wordCount: 0,
          readingTime: 1,
          hasImages: false,
          hasSections: false,
        },
      };
    }
  }

  /**
   * Clean BeehIiv specific HTML
   */
  private cleanBeehiivHtml(html: string): string {
    return html
      // Remove BeehIiv styles and scripts
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      
      // Remove BeehIiv specific classes and attributes
      .replace(/class="beehiiv[^"]*"/gi, '')
      .replace(/data-beehiiv[^=]*="[^"]*"/gi, '')
      .replace(/<div class="beehiiv[^>]*>/gi, '<div>')
      
      // Clean inline styles (keep some basic ones)
      .replace(/style="[^"]*"/gi, (match) => {
        const styleContent = match.match(/style="([^"]*)"/)?.[1] || '';
        
        // Keep only safe styles
        const safeStyles = [];
        if (styleContent.includes('text-align')) {
          const textAlign = styleContent.match(/text-align:\s*([^;]+)/)?.[1]?.trim();
          if (textAlign && ['left', 'center', 'right', 'justify'].includes(textAlign)) {
            safeStyles.push(`text-align: ${textAlign}`);
          }
        }
        if (styleContent.includes('font-weight: bold') || styleContent.includes('font-weight:bold')) {
          safeStyles.push('font-weight: bold');
        }
        
        return safeStyles.length > 0 ? `style="${safeStyles.join('; ')}"` : '';
      })
      
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract images from HTML
   */
  private extractImages(html: string): string[] {
    const images: string[] = [];
    const imageRegex = /<img[^>]+src="([^">]+)"/gi;
    let match;
    
    while ((match = imageRegex.exec(html)) !== null) {
      const src = match[1];
      if (src && !images.includes(src)) {
        images.push(src);
      }
    }
    
    console.log(`📸 Extracted ${images.length} images`);
    return images;
  }

  /**
   * Parse content into sections based on headings
   */
  private parseSections(html: string): Array<{ title: string; content: string; blocks: ContentBlock[] }> {
    const sections = [];
    
    // Common section patterns for The News
    const sectionPatterns = [
      // Pattern 1: Explicit section headings
      /(?:<h[1-6][^>]*>([^<]*(?:BRASIL|MUNDO|NEGÓCIOS|MÍDIA|VARIEDADES|ECONOMIA|POLÍTICA|INTERNACIONAL|TECNOLOGIA|ESPORTES)[^<]*)<\/h[1-6]>)([\s\S]*?)(?=<h[1-6]|$)/gi,
      
      // Pattern 2: Any heading followed by content
      /(?:<h[1-6][^>]*>([^<]+)<\/h[1-6]>)([\s\S]*?)(?=<h[1-6]|$)/gi,
      
      // Pattern 3: Strong tags used as headings
      /(?:<(?:strong|b)>([^<]*(?:BRASIL|MUNDO|NEGÓCIOS|MÍDIA|VARIEDADES|ECONOMIA|POLÍTICA)[^<]*)<\/(?:strong|b)>)([\s\S]*?)(?=<(?:strong|b)>|$)/gi,
    ];

    for (const pattern of sectionPatterns) {
      pattern.lastIndex = 0; // Reset regex
      let match;
      
      while ((match = pattern.exec(html)) !== null) {
        const title = match[1].trim().replace(/<[^>]*>/g, ''); // Strip HTML from title
        const content = match[2].trim();
        
        // Only include sections with substantial content
        if (title && content && content.length > 100) {
          const blocks = this.htmlToBlocks(content);
          
          sections.push({
            title,
            content: this.stripHtml(content),
            blocks,
          });
        }
      }
      
      // Use first successful pattern
      if (sections.length > 0) break;
    }
    
    console.log(`📑 Parsed ${sections.length} sections`);
    return sections;
  }

  /**
   * Convert HTML to structured blocks
   */
  private htmlToBlocks(html: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    
    // Split HTML into elements
    const elements = this.parseHtmlElements(html);
    
    for (const element of elements) {
      const block = this.elementToBlock(element);
      if (block) {
        blocks.push(block);
      }
    }
    
    return blocks;
  }

  /**
   * Parse HTML into elements
   */
  private parseHtmlElements(html: string): Array<{ tag: string; content: string; attributes: Record<string, string> }> {
    const elements = [];
    
    // Simple regex-based HTML parsing (for basic content)
    const tagRegex = /<(\w+)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\s*\/?>|([^<]+)/gi;
    let match;
    
    while ((match = tagRegex.exec(html)) !== null) {
      if (match[1]) {
        // Paired tag
        elements.push({
          tag: match[1].toLowerCase(),
          content: match[3] || '',
          attributes: this.parseAttributes(match[2] || ''),
        });
      } else if (match[4]) {
        // Self-closing tag
        elements.push({
          tag: match[4].toLowerCase(),
          content: '',
          attributes: this.parseAttributes(match[5] || ''),
        });
      } else if (match[6]) {
        // Text content
        const text = match[6].trim();
        if (text) {
          elements.push({
            tag: 'text',
            content: text,
            attributes: {},
          });
        }
      }
    }
    
    return elements;
  }

  /**
   * Parse HTML attributes
   */
  private parseAttributes(attrString: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let match;
    
    while ((match = attrRegex.exec(attrString)) !== null) {
      attributes[match[1]] = match[2];
    }
    
    return attributes;
  }

  /**
   * Convert HTML element to content block
   */
  private elementToBlock(element: { tag: string; content: string; attributes: Record<string, string> }): ContentBlock | null {
    const { tag, content, attributes } = element;
    
    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return {
          id: this.generateBlockId(),
          type: 'heading',
          data: {
            text: this.stripHtml(content),
            level: parseInt(tag[1]),
          },
        };
      
      case 'p':
        const text = this.stripHtml(content).trim();
        if (text) {
          return {
            id: this.generateBlockId(),
            type: 'paragraph',
            data: { text },
          };
        }
        return null;
      
      case 'img':
        return {
          id: this.generateBlockId(),
          type: 'image',
          data: {
            url: attributes.src || '',
            alt: attributes.alt || '',
            caption: attributes.title || '',
          },
        };
      
      case 'blockquote':
        return {
          id: this.generateBlockId(),
          type: 'quote',
          data: {
            text: this.stripHtml(content),
          },
        };
      
      case 'ul':
      case 'ol':
        const items = this.extractListItems(content);
        if (items.length > 0) {
          return {
            id: this.generateBlockId(),
            type: 'list',
            data: {
              style: tag === 'ol' ? 'ordered' : 'unordered',
              items,
            },
          };
        }
        return null;
      
      case 'hr':
        return {
          id: this.generateBlockId(),
          type: 'divider',
          data: {},
        };
      
      case 'text':
        const textContent = content.trim();
        if (textContent && textContent.length > 10) {
          return {
            id: this.generateBlockId(),
            type: 'paragraph',
            data: { text: textContent },
          };
        }
        return null;
      
      default:
        // For other tags, try to extract text content
        const innerText = this.stripHtml(content).trim();
        if (innerText && innerText.length > 10) {
          return {
            id: this.generateBlockId(),
            type: 'paragraph',
            data: { text: innerText },
          };
        }
        return null;
    }
  }

  /**
   * Extract list items from ul/ol content
   */
  private extractListItems(listHtml: string): string[] {
    const items = [];
    const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let match;
    
    while ((match = itemRegex.exec(listHtml)) !== null) {
      const item = this.stripHtml(match[1]).trim();
      if (item) {
        items.push(item);
      }
    }
    
    return items;
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  }

  /**
   * Calculate content metadata
   */
  private calculateMetadata(blocks: ContentBlock[], images: string[]): ParsedContent['metadata'] {
    const textBlocks = blocks.filter(b => b.type === 'paragraph' || b.type === 'heading');
    const allText = textBlocks.map(b => b.data.text || '').join(' ');
    const wordCount = allText.split(/\s+/).filter(word => word.length > 0).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // Average 200 words per minute
    
    return {
      wordCount,
      readingTime,
      hasImages: images.length > 0,
      hasSections: blocks.some(b => b.type === 'heading'),
    };
  }

  /**
   * Generate unique block ID
   */
  private generateBlockId(): string {
    return `block_${++this.blockIdCounter}_${Date.now()}`;
  }

  /**
   * Auto-detect category based on content
   */
  detectCategory(title: string, content: string, sections: Array<{ title: string; content: string }>): string {
    const fullText = (title + ' ' + content + ' ' + sections.map(s => s.title + ' ' + s.content).join(' ')).toLowerCase();
    
    const categoryKeywords = {
      'politica': [
        'brasil', 'governo', 'ministro', 'presidente', 'congresso', 'senado', 'deputado',
        'política', 'eleição', 'partido', 'stf', 'supremo', 'lula', 'bolsonaro'
      ],
      'internacional': [
        'mundo', 'internacional', 'país', 'frança', 'eua', 'europa', 'china', 'russia',
        'guerra', 'conflito', 'diplomacia', 'exterior', 'embaixada', 'otan'
      ],
      'economia': [
        'economia', 'mercado', 'real', 'dólar', 'inflação', 'pib', 'banco central',
        'juros', 'selic', 'bolsa', 'investimento', 'empresas', 'negócios', 'bilhão'
      ],
      'tecnologia': [
        'tecnologia', 'tech', 'ia', 'inteligência artificial', 'startup', 'google',
        'apple', 'microsoft', 'meta', 'twitter', 'x', 'digital', 'internet', 'app'
      ],
      'entretenimento': [
        'entretenimento', 'cultura', 'cinema', 'música', 'show', 'artista',
        'celebridade', 'novela', 'tv', 'streaming', 'netflix', 'globo'
      ],
      'esportes': [
        'esporte', 'futebol', 'copa', 'seleção', 'flamengo', 'corinthians',
        'palmeiras', 'olympics', 'olimpíadas', 'atleta', 'campeonato'
      ],
    };

    // Score each category
    let bestCategory = 'geral';
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      let score = 0;
      
      for (const keyword of keywords) {
        // Count occurrences, give more weight to title matches
        const titleMatches = (title.toLowerCase().match(new RegExp(keyword, 'g')) || []).length * 3;
        const contentMatches = (fullText.match(new RegExp(keyword, 'g')) || []).length;
        score += titleMatches + contentMatches;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }

    console.log(`🏷️ Auto-detected category: ${bestCategory} (score: ${bestScore})`);
    return bestCategory;
  }
}