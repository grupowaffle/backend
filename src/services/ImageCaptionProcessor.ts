/**
 * Serviço para processar imagens com legendas do conteúdo HTML
 */
export class ImageCaptionProcessor {
  
  /**
   * Extrai todas as imagens com suas legendas do conteúdo HTML
   */
  static extractImagesWithCaptions(htmlContent: string): Array<{
    src: string;
    alt?: string;
    caption?: string;
    element: string;
  }> {
    const images: Array<{
      src: string;
      alt?: string;
      caption?: string;
      element: string;
    }> = [];

    if (!htmlContent || typeof htmlContent !== 'string') {
      return images;
    }

    // Regex para encontrar divs com classe image-with-caption-wrapper
    const imageWrapperRegex = /<div[^>]*class="[^"]*image-with-caption-wrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    let match;

    while ((match = imageWrapperRegex.exec(htmlContent)) !== null) {
      const wrapperContent = match[1];
      
      // Extrair imagem com regex melhorado
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/i;
      const imgMatch = imgRegex.exec(wrapperContent);
      
      if (imgMatch) {
        const src = imgMatch[1];
        const alt = imgMatch[2] || '';
        
        // Extrair legenda - regex que funciona
        const captionRegex = /<div[^>]*class="[^"]*image-caption[^"]*"[^>]*>([^<]+)/i;
        const captionMatch = captionRegex.exec(wrapperContent);
        const caption = captionMatch ? captionMatch[1].trim() : '';
        
        images.push({
          src,
          alt,
          caption,
          element: match[0]
        });
      }
    }

    // Se não encontrou imagens com wrapper, procurar por imagens simples
    if (images.length === 0) {
      const simpleImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
      let imgMatch;
      
      while ((imgMatch = simpleImgRegex.exec(htmlContent)) !== null) {
        images.push({
          src: imgMatch[1],
          alt: imgMatch[2] || '',
          caption: '',
          element: imgMatch[0]
        });
      }
    }

    return images;
  }

  /**
   * Processa o conteúdo HTML e extrai informações das imagens para salvar no banco
   */
  static processContentImages(htmlContent: string): Array<{
    url: string;
    alt?: string;
    caption?: string;
    source: string;
  }> {
    const images = this.extractImagesWithCaptions(htmlContent);
    
    return images.map(img => ({
      url: img.src,
      alt: img.alt,
      caption: img.caption,
      source: 'content'
    }));
  }

  /**
   * Atualiza o conteúdo HTML para incluir legendas nas imagens
   */
  static updateImageCaptions(htmlContent: string, imageCaptions: Record<string, string>): string {
    let updatedContent = htmlContent;

    // Atualizar imagens com wrapper
    const imageWrapperRegex = /<div[^>]*class="[^"]*image-with-caption-wrapper[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
    
    updatedContent = updatedContent.replace(imageWrapperRegex, (match, wrapperContent) => {
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
      const imgMatch = imgRegex.exec(wrapperContent);
      
      if (imgMatch) {
        const src = imgMatch[1];
        const caption = imageCaptions[src] || '';
        
        // Se tem legenda, atualizar ou adicionar
        if (caption) {
          const captionDiv = `<div class="image-caption text-sm text-muted-foreground italic mt-2">${caption}</div>`;
          
          // Verificar se já existe div de legenda
          if (wrapperContent.includes('image-caption')) {
            return match.replace(
              /<div[^>]*class="[^"]*image-caption[^"]*"[^>]*>[\s\S]*?<\/div>/i,
              captionDiv
            );
          } else {
            return match.replace('</div>', `${captionDiv}</div>`);
          }
        }
      }
      
      return match;
    });

    return updatedContent;
  }

  /**
   * Extrai a primeira imagem com legenda do conteúdo
   */
  static extractFirstImageWithCaption(htmlContent: string): {
    url: string;
    alt?: string;
    caption?: string;
  } | null {
    const images = this.extractImagesWithCaptions(htmlContent);
    
    if (images.length === 0) {
      return null;
    }

    const firstImage = images[0];
    return {
      url: firstImage.src,
      alt: firstImage.alt,
      caption: firstImage.caption
    };
  }
}