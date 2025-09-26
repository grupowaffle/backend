/**
 * Script para testar o parse de newsletter e conversão para múltiplos artigos
 */
import { getDrizzleClient } from './src/config/db';
import { BeehiivService } from './src/services/BeehiivService';
import { BeehiivRepository } from './src/repositories';

async function testNewsletterParse() {
  console.log('🧪 Iniciando teste de parse de newsletter...\n');

  // Simular env
  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    BEEHIIV_API_KEY: process.env.BEEHIIV_API_KEY,
    BEEHIIV_PUBLICATIONS: process.env.BEEHIIV_PUBLICATIONS,
  };

  const db = getDrizzleClient(env);
  const beehiivService = new BeehiivService(db, env);
  const beehiivRepo = new BeehiivRepository(db);

  try {
    // 1. Buscar o post mais recente do BeehIV
    console.log('📡 Buscando posts do BeehIV...');
    const postsResult = await beehiivRepo.listAllPosts({ page: 1, limit: 1 });
    const posts = postsResult.data;

    if (posts.length === 0) {
      console.log('❌ Nenhum post encontrado no banco de dados');
      console.log('💡 Execute primeiro a sincronização do BeehIV');
      return;
    }

    const latestPost = posts[0];
    console.log(`\n✅ Post encontrado: "${latestPost.title}"`);
    console.log(`   ID: ${latestPost.beehiivId}`);
    console.log(`   RSS Content length: ${latestPost.rssContent?.length || 0} chars`);

    if (!latestPost.rssContent || latestPost.rssContent.length === 0) {
      console.log('❌ Post não tem conteúdo RSS');
      return;
    }

    // 2. Mostrar amostra do RSS
    console.log('\n📄 Amostra do RSS (primeiros 1000 chars):');
    console.log('─'.repeat(80));
    console.log(latestPost.rssContent.substring(0, 1000));
    console.log('─'.repeat(80));

    // 3. Procurar padrões de categorias e títulos no RSS
    const h6Matches = latestPost.rssContent.match(/<h6[^>]*id="[^"]*"[^>]*>[^<]+<\/h6>/gi) || [];
    const h1Matches = latestPost.rssContent.match(/<h1[^>]*>[^<]+<\/h1>/gi) || [];
    const hrMatches = latestPost.rssContent.match(/<hr[^>]*class="[^"]*content_break[^"]*"[^>]*>/gi) || [];

    console.log(`\n🔍 Padrões encontrados no RSS:`);
    console.log(`   - H6 (categorias) com ID: ${h6Matches.length}`);
    console.log(`   - H1 (títulos): ${h1Matches.length}`);
    console.log(`   - HR separadores: ${hrMatches.length}`);

    if (h6Matches.length > 0) {
      console.log('\n🏷️ Categorias encontradas:');
      h6Matches.slice(0, 5).forEach((match, i) => {
        console.log(`   ${i + 1}. ${match}`);
      });
    }

    if (h1Matches.length > 0) {
      console.log('\n📰 Títulos encontrados:');
      h1Matches.slice(0, 5).forEach((match, i) => {
        console.log(`   ${i + 1}. ${match}`);
      });
    }

    // 4. Converter para formato BeehiivPostResponse
    const postResponse = {
      id: latestPost.beehiivId,
      title: latestPost.title,
      subtitle: latestPost.subtitle || '',
      authors: [],
      created: latestPost.createdTimestamp || Math.floor(Date.now() / 1000),
      status: latestPost.status,
      publish_date: latestPost.publishDate ? Math.floor(latestPost.publishDate.getTime() / 1000) : null,
      displayed_date: latestPost.displayedDate ? Math.floor(latestPost.displayedDate.getTime() / 1000) : null,
      split_tested: latestPost.splitTested || false,
      subject_line: latestPost.subjectLine || '',
      preview_text: latestPost.previewText || '',
      slug: latestPost.slug || '',
      thumbnail_url: latestPost.thumbnailUrl || '',
      web_url: latestPost.webUrl || '',
      audience: latestPost.audience || '',
      platform: latestPost.platform || '',
      content_tags: latestPost.contentTags || [],
      meta_default_description: latestPost.metaDescription,
      meta_default_title: latestPost.metaTitle,
      hidden_from_feed: latestPost.hiddenFromFeed || false,
      content: {
        free: {
          rss: latestPost.rssContent || ''
        }
      }
    };

    // 5. Tentar converter para múltiplos artigos
    console.log('\n🔄 Convertendo post para múltiplos artigos...\n');
    const articles = await beehiivService.convertBeehiivPostToMultipleArticles(
      postResponse,
      latestPost.id
    );

    console.log(`\n✅ Conversão concluída!`);
    console.log(`   Total de artigos criados: ${articles.length}`);

    if (articles.length > 0) {
      console.log('\n📋 Artigos criados:');
      articles.forEach((article, i) => {
        console.log(`\n   ${i + 1}. ${article.title}`);
        console.log(`      ID: ${article.id}`);
        console.log(`      Slug: ${article.slug}`);
        console.log(`      Categoria: ${article.category}`);
        console.log(`      Status: ${article.status}`);
        console.log(`      Source ID: ${article.sourceId}`);
        console.log(`      Blocos de conteúdo: ${article.content?.length || 0}`);
        if (article.featuredImage) {
          console.log(`      Imagem: ${article.featuredImage.substring(0, 60)}...`);
        }
      });
    } else {
      console.log('\n⚠️ Nenhum artigo foi criado!');
      console.log('   Possíveis problemas:');
      console.log('   1. O RSS não contém o padrão esperado (h6 com id + h1)');
      console.log('   2. As seções estão sendo filtradas incorretamente');
      console.log('   3. O parser está falhando silenciosamente');
    }

  } catch (error) {
    console.error('\n❌ Erro no teste:', error);
    if (error instanceof Error) {
      console.error('   Mensagem:', error.message);
      console.error('   Stack:', error.stack);
    }
  }
}

// Executar teste
testNewsletterParse()
  .then(() => {
    console.log('\n✅ Teste concluído');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
  });