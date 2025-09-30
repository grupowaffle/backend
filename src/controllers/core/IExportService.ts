// Export service interface (Single Responsibility Principle)
export interface IExportService {
  generateCSV(data: any[]): string;
  generateXLSX?(data: any[]): Buffer;
  generatePDF?(data: any[]): Buffer;
}

export class ArticleExportService implements IExportService {
  generateCSV(articles: any[]): string {
    // CSV headers
    const headers = [
      'ID',
      'Título',
      'Slug',
      'Status',
      'Categoria',
      'Autor',
      'Visualizações',
      'Likes',
      'Shares',
      'Criado em',
      'Publicado em',
      'Resumo'
    ];

    // Generate CSV rows
    const rows = articles.map(item => {
      const article = item.article || item;
      const category = item.category;
      const author = item.author;

      return [
        article.id || '',
        (article.title || '').replace(/"/g, '""'), // Escape quotes
        article.slug || '',
        article.status || '',
        category?.name || '',
        author?.name || '',
        article.views || 0,
        article.likes || 0,
        article.shares || 0,
        article.createdAt ? new Date(article.createdAt).toLocaleDateString('pt-BR') : '',
        article.publishedAt ? new Date(article.publishedAt).toLocaleDateString('pt-BR') : '',
        (article.excerpt || '').replace(/"/g, '""').substring(0, 200) // Limit excerpt and escape quotes
      ];
    });

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    // Add BOM for UTF-8 to ensure proper encoding in Excel
    return '\uFEFF' + csvContent;
  }
}