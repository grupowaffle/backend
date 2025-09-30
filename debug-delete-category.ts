import { getDrizzleClient } from './src/config/db';
import { CategoryRepository } from './src/repositories/CategoryRepository';

async function debugDeleteCategory() {
  console.log('🐛 Debug: Tentativa de exclusão de categoria...\n');

  const env = {
    DATABASE_URL: process.env.NEON_URL || process.env.DATABASE_URL,
  };

  try {
    const db = getDrizzleClient(env);
    const categoryRepo = new CategoryRepository(db);

    const categoryId = 'id_t0f7qcxprmg17vhj5'; // Categoria "Negócios"

    console.log('1. Verificando dependências...');
    const dependencies = await categoryRepo.checkDependencies(categoryId);
    console.log('   Dependências:', JSON.stringify(dependencies, null, 2));

    console.log('\n2. Verificando condições de exclusão...');
    console.log('   force:', false);
    console.log('   moveArticlesTo:', undefined);
    console.log('   dependencies.articles > 0:', dependencies.articles > 0);
    console.log('   dependencies.hasChildren:', dependencies.hasChildren);

    const shouldFail = !false && !undefined && (dependencies.articles > 0 || dependencies.hasChildren);
    console.log('   Deveria falhar?', shouldFail);

    if (shouldFail) {
      console.log('\n3. Simulando erro que deveria ser lançado...');
      const issues = [];
      if (dependencies.articles > 0) issues.push(`${dependencies.articles} artigos`);
      if (dependencies.hasChildren) issues.push('subcategorias');
      console.log('   Erro:', `Não é possível excluir categoria: possui ${issues.join(' e ')}.`);
    }

    console.log('\n4. Tentativa real de exclusão...');
    try {
      const result = await categoryRepo.delete(categoryId);
      console.log('   ⚠️ INESPERADO: Categoria foi deletada!', result);
    } catch (error) {
      console.log('   ✅ Erro capturado:', error instanceof Error ? error.message : error);
    }

  } catch (error) {
    console.error('❌ Erro durante debug:', error);
  }
}

debugDeleteCategory().catch(console.error);