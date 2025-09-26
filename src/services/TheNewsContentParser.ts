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

export interface IndividualNews {
  numero: number;
  titulo: string;
  titulo_id: string;
  categoria: string;
  categoria_id: string;
  conteudo_html: string;
  resumo: string;
  imagem_principal: string;
  fonte_imagem: string;
  links_externos: Array<{ url: string; texto: string }>;
  total_links: number;
  id_inicio: string;
  id_fim: string;
}

export class TheNewsContentParser {
  private blockIdCounter = 0;

  /**
   * Extract individual news articles from The News RSS content (like PHP version)
   */
  extractIndividualNews(rssContent: string): IndividualNews[] {
    try {
      console.log('🗞️ Extracting individual news from The News RSS...');
      console.log(`📄 Original RSS length: ${rssContent.length} chars`);

      // Clean HTML
      const cleanHtml = this.cleanBeehiivHtml(rssContent);
      console.log(`🧹 Cleaned HTML length: ${cleanHtml.length} chars`);

      // Use regex-based parsing for Cloudflare Workers compatibility
      const result = this.extractNewsWithRegex(cleanHtml);
      console.log(`🎯 Parser result: ${result.length} news items found`);

      return result;

    } catch (error) {
      console.error('❌ Error extracting individual news:', error);
      return [];
    }
  }

  /**
   * Extract news using regex (PHP-like approach for Cloudflare Workers compatibility)
   */
  private extractNewsWithRegex(html: string): IndividualNews[] {
    const noticias: IndividualNews[] = [];
    let numeroNoticia = 1;

    try {
      console.log('🔍 Starting PHP-like regex extraction...');
      console.log(`📄 HTML length: ${html.length} chars`);

      // Clean HTML first (like PHP limparURLsImagens)
      const cleanedHtml = this.cleanHtmlAttributes(html);

      // Sections to ignore (like PHP)
      const secoesIgnorar = [
        'rodapé', 'quem somos', 'dicas do final de semana',
        'opinião do leitor', 'apresentado por'
      ];

      // 1. PROCURAR POR CATEGORIAS (h6 com id) - like PHP
      // The pattern looks for <h6 id="xxx">CATEGORIA</h6> followed by content until next <h6 or <hr
      const categoryPattern = /<h6[^>]*id="([^"]*)"[^>]*>([^<]+)<\/h6>([\s\S]*?)(?=<h6[^>]*id=|<hr[^>]*class="[^"]*content_break|$)/gi;
      let categoryMatch;

      console.log('🔍 Looking for h6 categories with IDs...');
      console.log(`📄 Searching in ${cleanedHtml.length} chars of HTML`);

      // Debug: Check if we have h6 tags
      const h6Count = (cleanedHtml.match(/<h6[^>]*>/g) || []).length;
      console.log(`🎯 Found ${h6Count} h6 tags in total`);

      while ((categoryMatch = categoryPattern.exec(cleanedHtml)) !== null) {
        const categoriaId = categoryMatch[1].trim();
        const categoriaNome = categoryMatch[2].trim().toUpperCase();
        const sectionContent = categoryMatch[3];

        console.log(`📂 Found category: "${categoriaNome}" (id: ${categoriaId})`);

        // Check if should ignore this section
        const deveIgnorar = secoesIgnorar.some(ignorar =>
          categoriaNome.toLowerCase().includes(ignorar.toLowerCase())
        );

        if (deveIgnorar) {
          console.log(`⏭️ Skipping ignored category: ${categoriaNome}`);
          continue;
        }

        // Look for h1 after this category - news titles
        // Updated pattern to capture h1 titles within the section
        const h1Pattern = /<h1[^>]*(?:id="([^"]*)")?[^>]*>([^<]+)<\/h1>([\s\S]*?)(?=<h1[^>]*(?:id=|>)|<h6[^>]*id=|<hr[^>]*class="[^"]*content_break|$)/gi;
        let h1Match;

        while ((h1Match = h1Pattern.exec(sectionContent)) !== null) {
          const tituloId = h1Match[1] || '';
          const tituloNoticia = h1Match[2].trim();
          const conteudoHtml = h1Match[3].trim();

          console.log(`📰 Found news: "${tituloNoticia}" (id: ${tituloId})`);

          // Skip generic or empty titles
          if (!tituloNoticia ||
              tituloNoticia === 'Título' ||
              tituloNoticia === 'Title' ||
              conteudoHtml.length < 20) {
            console.log(`⏭️ Skipping empty/template content: "${tituloNoticia}"`);
            continue;
          }

          // Extract first image with multiple strategies (like PHP)
          let primeiraImagem = '';
          let fonteImagem = '';

          // Strategy 1: Look for div.image > img (new structure)
          const imagePattern1 = /<div[^>]*class="[^"]*image[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/i;
          const imgMatch1 = imagePattern1.exec(conteudoHtml);

          if (imgMatch1) {
            primeiraImagem = this.cleanImageUrl(imgMatch1[1]);
            console.log(`🖼️ Found image (strategy 1): ${primeiraImagem}`);
          } else {
            // Strategy 2: Look for any img in content
            const imagePattern2 = /<img[^>]+src="([^"]+)"[^>]*>/i;
            const imgMatch2 = imagePattern2.exec(conteudoHtml);

            if (imgMatch2) {
              primeiraImagem = this.cleanImageUrl(imgMatch2[1]);
              console.log(`🖼️ Found image (strategy 2): ${primeiraImagem}`);
            }
          }

          // Extract external links
          const linksExternos = this.extractExternalLinks(conteudoHtml);

          // Generate automatic summary
          const resumo = this.generateSummary(conteudoHtml);

          // Clean content HTML
          const conteudoLimpo = this.cleanHtmlAttributes(conteudoHtml);

          const noticia: IndividualNews = {
            numero: numeroNoticia,
            titulo: tituloNoticia,
            titulo_id: tituloId,
            categoria: categoriaNome,
            categoria_id: categoriaId,
            conteudo_html: conteudoLimpo,
            resumo: resumo,
            imagem_principal: primeiraImagem,
            fonte_imagem: fonteImagem,
            links_externos: linksExternos,
            total_links: linksExternos.length,
            id_inicio: `newsletter-${numeroNoticia}`,
            id_fim: `newsletter-fim-${numeroNoticia}`
          };

          console.log(`✅ Created news item ${numeroNoticia}:`, {
            titulo: noticia.titulo,
            categoria: noticia.categoria,
            contentLength: noticia.conteudo_html.length,
            hasImage: !!noticia.imagem_principal,
            linksCount: noticia.total_links
          });

          noticias.push(noticia);
          numeroNoticia++;
        }
      }

      // If no news found by category, try alternative extraction
      if (noticias.length === 0) {
        console.log('📰 No categorized news found, trying alternative extraction...');

        // Try to find content blocks between hr tags
        const hrSections = cleanedHtml.split(/<hr[^>]*class="[^"]*content_break[^"]*"[^>]*>/gi);
        console.log(`📦 Found ${hrSections.length} HR-separated sections`);

        for (let i = 0; i < hrSections.length; i++) {
          const section = hrSections[i];

          // Look for h6 category
          const categoryMatch = /<h6[^>]*id="([^"]*)"[^>]*>([^<]+)<\/h6>/i.exec(section);
          const categoria = categoryMatch ? categoryMatch[2].trim() : 'GERAL';
          const categoriaId = categoryMatch ? categoryMatch[1].trim() : 'geral';

          // Look for h1 title
          const h1Match = /<h1[^>]*>([^<]+)<\/h1>/i.exec(section);
          if (!h1Match) continue;

          const tituloNoticia = h1Match[1].trim();

          // Extract content after h1
          const h1Index = section.indexOf(h1Match[0]);
          const conteudoHtml = section.substring(h1Index + h1Match[0].length).trim();

          console.log(`📰 Found direct h1: "${tituloNoticia}"`);
          console.log(`📄 Content length: ${conteudoHtml.length}`);
          console.log(`📄 Content sample:`, conteudoHtml.substring(0, 200));

          // Skip if title is generic or content is too short
          if (!tituloNoticia ||
              tituloNoticia === 'Título' ||
              tituloNoticia === 'Title' ||
              conteudoHtml.length < 20 ||
              conteudoHtml.trim() === '<p class="paragraph" style="text-align:left;"></p>') {
            console.log(`⏭️ Skipping empty/template direct h1: title="${tituloNoticia}", content length=${conteudoHtml.length}`);
            continue;
          }

          // Extract first image
          const imgPattern = /<img[^>]*src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>/i;
          const imgMatch = imgPattern.exec(conteudoHtml);

          const imagens: Array<{ src: string; alt: string }> = [];
          if (imgMatch) {
            const cleanedSrc = this.cleanImageUrl(imgMatch[1]);
            console.log(`🖼️ Found image in direct h1: ${cleanedSrc}`);
            imagens.push({
              src: cleanedSrc,
              alt: imgMatch[2] || ''
            });
          }

          const noticia: IndividualNews = {
            numero: numeroNoticia,
            titulo: tituloNoticia,
            categoria: 'Geral',
            conteudo_html: this.cleanBeehiivHtml(conteudoHtml),
            imagens: imagens,
            id_inicio: `rss-${numeroNoticia}`,
            id_fim: `rss-fim-${numeroNoticia}`
          };

          console.log(`✅ Created direct h1 news item ${numeroNoticia}:`, {
            titulo: noticia.titulo,
            categoria: noticia.categoria,
            contentLength: noticia.conteudo_html.length,
            imageCount: noticia.imagens.length
          });

          noticias.push(noticia);
          numeroNoticia++;
        }
      }

      console.log(`✅ Extracted ${noticias.length} individual news articles using regex`);
      return noticias;

    } catch (error) {
      console.error('❌ Error in regex extraction:', error);
      return [];
    }
  }

  /**
   * Clean image URL (remove escape characters) - PHP-like implementation
   */
  private cleanImageUrl(url: string): string {
    if (!url) return '';

    // Limpar escapes específicos do Beehiiv (like PHP version)
    let cleaned = url
      .replace(/\\&quot;/g, '')
      .replace(/&quot;/g, '')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/')
      .replace(/\\\\/g, '\\')
      .replace(/\\/g, '');

    // Decodificar entidades HTML
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ');

    return cleaned.trim();
  }

  /**
   * Clean HTML attributes (PHP-like implementation)
   */
  private cleanHtmlAttributes(html: string): string {
    if (!html) return '';

    // Patterns para limpar atributos com escapes (like PHP)
    const patterns = [
      { pattern: /class="([^"]*\\[^"]*)"/g, name: 'class' },
      { pattern: /alt="([^"]*\\[^"]*)"/g, name: 'alt' },
      { pattern: /style="([^"]*\\[^"]*)"/g, name: 'style' },
      { pattern: /src="([^"]*\\[^"]*)"/g, name: 'src' }
    ];

    let cleaned = html;

    for (const { pattern } of patterns) {
      cleaned = cleaned.replace(pattern, (match) => {
        const value = match.substring(match.indexOf('"') + 1, match.lastIndexOf('"'));

        const cleanedValue = value
          .replace(/\\&quot;/g, '')
          .replace(/&quot;/g, '')
          .replace(/\\"/g, '"')
          .replace(/\\\//g, '/')
          .replace(/\\\\/g, '\\')
          .replace(/\\/g, '');

        return match.charAt(0) + cleanedValue + '"';
      });
    }

    // Limpeza adicional
    cleaned = cleaned
      .replace(/\\&quot;/g, '')
      .replace(/&quot;/g, '')
      .replace(/\\"/g, '"')
      .replace(/\\\//g, '/');

    return cleaned;
  }

  /**
   * Extract external links from HTML content
   */
  private extractExternalLinks(html: string): Array<{ url: string; texto: string }> {
    const links = [];
    const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)</gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
      const href = match[1];
      const texto = match[2];

      // Filter only external links (not internal newsletter links)
      if (href.startsWith('http') &&
          !href.includes('thenewscc.com.br') &&
          !href.includes('api.whatsapp.com')) {
        links.push({
          url: href,
          texto: texto.trim()
        });
      }
    }

    return links;
  }

  /**
   * Generate automatic summary from HTML content
   */
  private generateSummary(html: string): string {
    if (!html) return '';

    // Strip HTML tags
    const textOnly = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Return first 200 characters
    return textOnly.length > 200
      ? textOnly.substring(0, 200) + '...'
      : textOnly;
  }

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