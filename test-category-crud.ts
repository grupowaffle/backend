import { getDrizzleClient } from './src/config/db';
import { CategoryRepository } from './src/repositories/CategoryRepository';
import { NewCategory } from './src/config/db/schema';

async function testCategoryCRUD() {
  console.log('🧪 Testando operações CRUD em categorias...\n');

  const env = {
    DATABASE_URL: process.env.NEON_URL || process.env.DATABASE_URL,
  };

  try {
    const db = getDrizzleClient(env);
    const categoryRepo = new CategoryRepository(db);

    // 1. Listar categorias existentes
    console.log('📋 1. Listando categorias existentes:');
    const existingCategories = await categoryRepo.list();
    console.log(`   Total: ${existingCategories.length} categorias`);
    existingCategories.forEach(cat => {
      console.log(`   - ${cat.name} (${cat.slug}) - ID: ${cat.id}`);
    });

    if (existingCategories.length === 0) {
      console.log('   ⚠️  Nenhuma categoria encontrada para teste');
      return;
    }

    const testCategory = existingCategories[0];
    console.log(`\n🎯 Usando categoria "${testCategory.name}" para testes...`);

    // 2. Tentar buscar por ID
    console.log('\n🔍 2. Testando busca por ID:');
    const foundCategory = await categoryRepo.findById(testCategory.id);
    if (foundCategory) {
      console.log(`   ✅ Categoria encontrada: ${foundCategory.name}`);
    } else {
      console.log(`   ❌ Categoria não encontrada`);
    }

    // 3. Tentar buscar por slug
    console.log('\n🔍 3. Testando busca por slug:');
    const foundBySlug = await categoryRepo.findBySlug(testCategory.slug);
    if (foundBySlug) {
      console.log(`   ✅ Categoria encontrada por slug: ${foundBySlug.name}`);
    } else {
      console.log(`   ❌ Categoria não encontrada por slug`);
    }

    // 4. Tentar criar uma nova categoria
    console.log('\n➕ 4. Testando criação de categoria:');
    const newCategoryData: NewCategory = {
      name: 'Teste CRUD',
      slug: 'teste-crud-' + Date.now(),
      description: 'Categoria criada para teste de CRUD',
      color: '#FF0000',
      order: 999,
      isActive: true,
    };

    try {
      const createdCategory = await categoryRepo.create(newCategoryData);
      console.log(`   ✅ Categoria criada: ${createdCategory.name} (ID: ${createdCategory.id})`);

      // 5. Tentar atualizar a categoria criada
      console.log('\n✏️  5. Testando atualização de categoria:');
      const updateData = {
        name: 'Teste CRUD Atualizado',
        description: 'Descrição atualizada',
        color: '#00FF00',
      };

      try {
        const updatedCategory = await categoryRepo.update(createdCategory.id, updateData);
        if (updatedCategory) {
          console.log(`   ✅ Categoria atualizada: ${updatedCategory.name}`);
        } else {
          console.log(`   ❌ Falha ao atualizar categoria`);
        }

        // 6. Tentar deletar a categoria criada
        console.log('\n🗑️  6. Testando exclusão de categoria:');
        try {
          const deleted = await categoryRepo.delete(createdCategory.id);
          if (deleted) {
            console.log(`   ✅ Categoria deletada com sucesso`);
          } else {
            console.log(`   ❌ Falha ao deletar categoria`);
          }
        } catch (deleteError) {
          console.log(`   ❌ Erro ao deletar categoria:`);
          console.log(`      ${deleteError instanceof Error ? deleteError.message : deleteError}`);
        }

      } catch (updateError) {
        console.log(`   ❌ Erro ao atualizar categoria:`);
        console.log(`      ${updateError instanceof Error ? updateError.message : updateError}`);
      }

    } catch (createError) {
      console.log(`   ❌ Erro ao criar categoria:`);
      console.log(`      ${createError instanceof Error ? createError.message : createError}`);
    }

    // 7. Tentar deletar uma categoria que tem artigos associados
    console.log('\n⚠️  7. Testando exclusão de categoria com artigos associados:');
    const categoriesWithArticles = await categoryRepo.listWithArticleCount();
    const categoryWithArticles = categoriesWithArticles.find(cat => cat.articleCount > 0);

    if (categoryWithArticles) {
      console.log(`   Tentando deletar "${categoryWithArticles.name}" que tem ${categoryWithArticles.articleCount} artigos...`);
      try {
        const deleted = await categoryRepo.delete(categoryWithArticles.id);
        if (deleted) {
          console.log(`   ⚠️  Categoria com artigos foi deletada (possível problema!)`);
        } else {
          console.log(`   ✅ Categoria não foi deletada (comportamento esperado)`);
        }
      } catch (deleteError) {
        console.log(`   ✅ Erro ao deletar categoria com artigos (comportamento esperado):`);
        console.log(`      ${deleteError instanceof Error ? deleteError.message : deleteError}`);
      }
    } else {
      console.log(`   Nenhuma categoria com artigos encontrada para teste`);
    }

    console.log('\n✅ Teste de CRUD concluído.');

  } catch (error) {
    console.error('❌ Erro durante teste de CRUD:', error);
    process.exit(1);
  }
}

testCategoryCRUD().catch(console.error);