import { extrairNoticiasNewsletter, type NewsletterData } from './src/services/NewsletterParser';

const fs = require('fs');
const rawPost = JSON.parse(fs.readFileSync('beehiiv-raw-response.json', 'utf-8'));

const newsletterData: NewsletterData = {
  id: rawPost.id,
  title: rawPost.title,
  subject_line: rawPost.subject_line,
  preview_text: rawPost.preview_text,
  thumbnail_url: rawPost.thumbnail_url,
  web_url: rawPost.web_url,
  created: rawPost.created,
  publish_date: rawPost.publish_date,
  content: rawPost.content
};

const result = extrairNoticiasNewsletter(newsletterData);

// Find the WhatsApp article
const whatsappNews = result.noticias.find(n => n.titulo.includes('WhatsApp'));

if (whatsappNews) {
  console.log('\n📰 Notícia: 93% dos brasileiros usam WhatsApp todo dia\n');
  console.log('📄 Conteúdo HTML extraído:');
  console.log('─'.repeat(80));
  console.log(whatsappNews.conteudo_html);
  console.log('─'.repeat(80));
  console.log(`\n📊 Tamanho: ${whatsappNews.conteudo_html.length} chars`);
  console.log(`📝 Resumo: ${whatsappNews.resumo}`);
  console.log(`🔗 Links: ${whatsappNews.total_links}`);
}

process.exit(0);
