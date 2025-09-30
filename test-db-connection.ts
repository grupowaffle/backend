import { getDrizzleClient, healthCheck } from './src/config/db';

async function testConnection() {
  console.log('🧪 Testando conexão com banco Neon...\n');

  const env = {
    DATABASE_URL: process.env.DATABASE_URL,
    NEON_URL: process.env.NEON_PROD, // Teste com produção também
    NODE_ENV: 'development'
  };

  console.log('📋 Configurações:');
  console.log(`   DATABASE_URL: ${env.DATABASE_URL?.substring(0, 50)}...`);
  console.log(`   NEON_URL: ${env.NEON_URL?.substring(0, 50)}...`);
  console.log('');

  // Teste 1: Conexão com DATABASE_URL
  console.log('🔍 Teste 1: Conectando com DATABASE_URL...');
  try {
    const testEnv1 = { DATABASE_URL: env.DATABASE_URL };
    const health1 = await healthCheck(testEnv1);
    console.log(`   Status: ${health1.status}`);
    console.log(`   Tipo: ${health1.connectionType}`);
    if (health1.error) console.log(`   Erro: ${health1.error}`);
  } catch (error) {
    console.log(`   ❌ Erro: ${error}`);
  }

  console.log('');

  // Teste 2: Conexão com NEON_URL (produção)
  console.log('🔍 Teste 2: Conectando com NEON_URL (produção)...');
  try {
    const testEnv2 = { NEON_URL: env.NEON_URL };
    const health2 = await healthCheck(testEnv2);
    console.log(`   Status: ${health2.status}`);
    console.log(`   Tipo: ${health2.connectionType}`);
    if (health2.error) console.log(`   Erro: ${health2.error}`);
  } catch (error) {
    console.log(`   ❌ Erro: ${error}`);
  }

  console.log('');

  // Teste 3: Conexão com fallback (ambos disponíveis)
  console.log('🔍 Teste 3: Testando prioridade NEON_URL > DATABASE_URL...');
  try {
    const health3 = await healthCheck(env);
    console.log(`   Status: ${health3.status}`);
    console.log(`   Tipo: ${health3.connectionType}`);
    if (health3.error) console.log(`   Erro: ${health3.error}`);
  } catch (error) {
    console.log(`   ❌ Erro: ${error}`);
  }

  console.log('\n✅ Teste de conexão concluído!');
}

testConnection().catch(console.error);