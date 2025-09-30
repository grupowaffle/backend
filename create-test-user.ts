// Script para criar usuário teste no D1
import bcrypt from 'bcryptjs';

async function createTestUser() {
  console.log('🔐 Criando usuário teste no D1...');

  // Configuração D1
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !apiToken) {
    console.error('❌ Variáveis de ambiente D1 não encontradas');
    return;
  }

  const email = 'admin@test.com';
  const password = 'admin123';
  const hashedPassword = await bcrypt.hash(password, 10);

  const userData = {
    email,
    password_hash: hashedPassword,
    name: 'Admin Teste',
    role: 'admin',
    brand_name: 'The News',
    is_active: 1,
    is_verified: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    console.log('📡 Enviando requisição para D1...');

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: `INSERT INTO users (
          email, password_hash, name, role, brand_name,
          is_active, is_verified, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          userData.email,
          userData.password_hash,
          userData.name,
          userData.role,
          userData.brand_name,
          userData.is_active,
          userData.is_verified,
          userData.created_at,
          userData.updated_at,
        ],
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Usuário criado com sucesso!');
      console.log('📧 Email:', email);
      console.log('🔑 Senha:', password);
      console.log('👤 Role:', userData.role);
    } else {
      console.error('❌ Erro ao criar usuário:', result.errors);
    }

  } catch (error) {
    console.error('❌ Erro na requisição:', error);
  }
}

createTestUser().catch(console.error);