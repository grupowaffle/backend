// Content parsing interface (Single Responsibility + Interface Segregation)
export interface ParsedContent {
  blocks: any[];
  metadata: {
    wordCount: number;
    readingTime: number;
    hasImages: boolean;
    hasSections: boolean;
  };
  sections: any[];
  extractedImages?: string[];
}

export interface IContentParser {
  parseRssContent(rssContent: string): ParsedContent;
  detectCategory(title: string, content: string, sections?: any[]): string;
}

export interface IHtmlConverter {
  htmlToBlocks(html: string): any[];
  htmlToRichBlocks(html: string, title: string): any[];
  extractExcerptFromHtml(html: string): string;
}