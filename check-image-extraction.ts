import { extrairNoticiasNewsletter } from './src/services/NewsletterParser';

const fs = require('fs');
const rawPost = JSON.parse(fs.readFileSync('beehiiv-raw-response.json', 'utf-8'));

const newsletterData = {
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

console.log('\n🖼️ Imagens extraídas:\n');
result.noticias.forEach((n, i) => {
  console.log(`${i + 1}. ${n.titulo.substring(0, 50)}...`);
  console.log(`   Imagem: ${n.imagem_principal || 'NÃO ENCONTRADA'}`);
  console.log('');
});

process.exit(0);
