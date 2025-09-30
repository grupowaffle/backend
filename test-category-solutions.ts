import { getDrizzleClient } from './src/config/db';
import { CategoryRepository } from './src/repositories/CategoryRepository';
import { NewCategory } from './src/config/db/schema';

async function testCategorySolutions() {
  console.log('🧪 Testando soluções implementadas para categorias...\n');

  const env = {
    DATABASE_URL: process.env.NEON_URL || process.env.DATABASE_URL,
  };

  try {
    const db = getDrizzleClient(env);
    const categoryRepo = new CategoryRepository(db);

    // 1. Listar categorias com contagem de artigos
    console.log('📋 1. Listando categorias com contagem de artigos:');
    const categoriesWithCount = await categoryRepo.listWithArticleCount();
    const categoryWithArticles = categoriesWithCount.find(cat => cat.articleCount > 0);
    const categoryWithoutArticles = categoriesWithCount.find(cat => cat.articleCount === 0);

    categoriesWithCount.forEach(cat => {
      console.log(`   - ${cat.name}: ${cat.articleCount} artigos`);
    });

    if (!categoryWithArticles) {
      console.log('   ⚠️  Nenhuma categoria com artigos encontrada para teste');
      return;
    }

    if (!categoryWithoutArticles) {
      console.log('   ⚠️  Nenhuma categoria sem artigos encontrada para teste');
      return;
    }

    // 2. Testar verificação de dependências
    console.log(`\n🔍 2. Verificando dependências da categoria "${categoryWithArticles.name}":`);
    const dependencies = await categoryRepo.checkDependencies(categoryWithArticles.id);
    console.log(`   - Artigos: ${dependencies.articles}`);
    console.log(`   - Analytics Events: ${dependencies.analyticsEvents}`);
    console.log(`   - Content Performance: ${dependencies.contentPerformance}`);
    console.log(`   - Featured Content: ${dependencies.featuredContent}`);
    console.log(`   - Tem subcategorias: ${dependencies.hasChildren}`);

    // 3. Testar exclusão sem force (deve falhar)
    console.log(`\n❌ 3. Tentando excluir categoria com artigos SEM force:`);
    console.log(`   Categoria: "${categoryWithArticles.name}" (${categoryWithArticles.articleCount} artigos)`);
    try {
      await categoryRepo.delete(categoryWithArticles.id);
      console.log(`   ⚠️  ERRO: Categoria foi deletada quando não deveria!`);
    } catch (error) {
      console.log(`   ✅ Erro esperado: ${error instanceof Error ? error.message : error}`);
    }

    // 4. Testar exclusão de categoria sem artigos (deve funcionar)
    console.log(`\n✅ 4. Tentando excluir categoria SEM artigos:`);
    console.log(`   Categoria: "${categoryWithoutArticles.name}" (${categoryWithoutArticles.articleCount} artigos)`);

    // Criar categoria temporária para teste
    const tempCategory: NewCategory = {
      name: 'Temp Test Category',
      slug: 'temp-test-' + Date.now(),
      description: 'Categoria temporária para teste',
      isActive: true,
    };

    const createdCategory = await categoryRepo.create(tempCategory);
    console.log(`   Categoria temporária criada: ${createdCategory.name}`);

    try {
      const deleted = await categoryRepo.delete(createdCategory.id);
      if (deleted) {
        console.log(`   ✅ Categoria sem artigos deletada com sucesso`);
      } else {
        console.log(`   ❌ Falha ao deletar categoria sem artigos`);
      }
    } catch (error) {
      console.log(`   ❌ Erro inesperado: ${error instanceof Error ? error.message : error}`);
    }

    // 5. Testar movimentação de artigos
    console.log(`\n🔄 5. Testando movimentação de artigos:`);
    console.log(`   De: "${categoryWithArticles.name}" (${categoryWithArticles.articleCount} artigos)`);
    console.log(`   Para: "${categoryWithoutArticles.name}" (${categoryWithoutArticles.articleCount} artigos)`);

    try {
      const deleted = await categoryRepo.delete(categoryWithArticles.id, {
        moveArticlesTo: categoryWithoutArticles.id
      });

      if (deleted) {
        console.log(`   ✅ Categoria deletada e artigos movidos com sucesso`);

        // Verificar se os artigos foram movidos
        const updatedCategories = await categoryRepo.listWithArticleCount();
        const targetCategory = updatedCategories.find(cat => cat.id === categoryWithoutArticles.id);
        console.log(`   📊 Nova contagem de artigos na categoria destino: ${targetCategory?.articleCount || 0}`);
      } else {
        console.log(`   ❌ Falha ao deletar categoria com movimentação`);
      }
    } catch (error) {
      console.log(`   ❌ Erro durante movimentação: ${error instanceof Error ? error.message : error}`);
    }

    console.log('\n✅ Teste das soluções concluído.');

  } catch (error) {
    console.error('❌ Erro durante teste das soluções:', error);
    process.exit(1);
  }
}

testCategorySolutions().catch(console.error);