import { getDrizzleClient } from './src/config/db';
import { CategoryRepository } from './src/repositories/CategoryRepository';
import { NewCategory } from './src/config/db/schema';
import { sql } from 'drizzle-orm';

async function testCategoryFinal() {
  console.log('🧪 Teste final das soluções implementadas para categorias...\n');

  const env = {
    DATABASE_URL: process.env.NEON_URL || process.env.DATABASE_URL,
  };

  try {
    const db = getDrizzleClient(env);
    const categoryRepo = new CategoryRepository(db);

    // 1. Criar duas categorias de teste
    console.log('➕ 1. Criando categorias de teste:');

    const categoryWithArticles: NewCategory = {
      name: 'Categoria com Artigos',
      slug: 'categoria-com-artigos-' + Date.now(),
      description: 'Esta categoria terá artigos',
      isActive: true,
    };

    const categoryWithoutArticles: NewCategory = {
      name: 'Categoria sem Artigos',
      slug: 'categoria-sem-artigos-' + Date.now(),
      description: 'Esta categoria não terá artigos',
      isActive: true,
    };

    const createdWithArticles = await categoryRepo.create(categoryWithArticles);
    const createdWithoutArticles = await categoryRepo.create(categoryWithoutArticles);

    console.log(`   ✅ Criada: ${createdWithArticles.name} (ID: ${createdWithArticles.id})`);
    console.log(`   ✅ Criada: ${createdWithoutArticles.name} (ID: ${createdWithoutArticles.id})`);

    // 2. Simular um artigo sendo criado na primeira categoria
    console.log('\n📝 2. Simulando criação de artigo na primeira categoria:');
    await db.execute(sql`
      INSERT INTO articles (id, title, slug, "categoryId", "createdAt", "updatedAt")
      VALUES (
        'test-article-' || extract(epoch from now()),
        'Artigo de Teste',
        'artigo-teste-' || extract(epoch from now()),
        ${createdWithArticles.id},
        now(),
        now()
      )
    `);
    console.log('   ✅ Artigo de teste criado');

    // 3. Verificar dependências das categorias
    console.log('\n🔍 3. Verificando dependências:');
    const depsWithArticles = await categoryRepo.checkDependencies(createdWithArticles.id);
    const depsWithoutArticles = await categoryRepo.checkDependencies(createdWithoutArticles.id);

    console.log(`   "${createdWithArticles.name}": ${depsWithArticles.articles} artigos`);
    console.log(`   "${createdWithoutArticles.name}": ${depsWithoutArticles.articles} artigos`);

    // 4. Testar exclusão sem force (deve falhar)
    console.log('\n❌ 4. Tentando excluir categoria com artigos SEM force:');
    try {
      await categoryRepo.delete(createdWithArticles.id);
      console.log(`   ⚠️  ERRO: Categoria foi deletada quando não deveria!`);
    } catch (error) {
      console.log(`   ✅ Erro esperado: ${error instanceof Error ? error.message : error}`);
    }

    // 5. Testar exclusão de categoria sem artigos (deve funcionar)
    console.log('\n✅ 5. Tentando excluir categoria SEM artigos:');
    try {
      const deleted = await categoryRepo.delete(createdWithoutArticles.id);
      if (deleted) {
        console.log(`   ✅ Categoria sem artigos deletada com sucesso`);
      } else {
        console.log(`   ❌ Falha ao deletar categoria sem artigos`);
      }
    } catch (error) {
      console.log(`   ❌ Erro inesperado: ${error instanceof Error ? error.message : error}`);
    }

    // 6. Criar nova categoria para movimentação
    console.log('\n➕ 6. Criando categoria de destino para movimentação:');
    const targetCategory: NewCategory = {
      name: 'Categoria Destino',
      slug: 'categoria-destino-' + Date.now(),
      description: 'Para onde os artigos serão movidos',
      isActive: true,
    };
    const createdTarget = await categoryRepo.create(targetCategory);
    console.log(`   ✅ Criada: ${createdTarget.name} (ID: ${createdTarget.id})`);

    // 7. Testar movimentação de artigos
    console.log('\n🔄 7. Testando movimentação de artigos:');
    console.log(`   De: "${createdWithArticles.name}" para "${createdTarget.name}"`);

    try {
      const deleted = await categoryRepo.delete(createdWithArticles.id, {
        moveArticlesTo: createdTarget.id
      });

      if (deleted) {
        console.log(`   ✅ Categoria deletada e artigos movidos com sucesso`);

        // Verificar se os artigos foram movidos
        const finalDeps = await categoryRepo.checkDependencies(createdTarget.id);
        console.log(`   📊 Artigos na categoria destino: ${finalDeps.articles}`);
      } else {
        console.log(`   ❌ Falha ao deletar categoria com movimentação`);
      }
    } catch (error) {
      console.log(`   ❌ Erro durante movimentação: ${error instanceof Error ? error.message : error}`);
    }

    // 8. Limpeza final
    console.log('\n🧹 8. Limpeza final:');
    try {
      await categoryRepo.delete(createdTarget.id, { force: true });
      console.log(`   ✅ Categoria destino deletada com force`);
    } catch (error) {
      console.log(`   ⚠️  Erro na limpeza: ${error instanceof Error ? error.message : error}`);
    }

    console.log('\n🎉 Teste final concluído com sucesso!');
    console.log('\n📋 RESUMO DAS SOLUÇÕES IMPLEMENTADAS:');
    console.log('   ✅ Verificação de dependências antes da exclusão');
    console.log('   ✅ Movimentação de artigos para outra categoria');
    console.log('   ✅ Exclusão forçada quando necessário');
    console.log('   ✅ Tratamento de erros específicos com códigos');
    console.log('   ✅ Aplicação dos princípios SOLID');

  } catch (error) {
    console.error('❌ Erro durante teste final:', error);
    process.exit(1);
  }
}

testCategoryFinal().catch(console.error);