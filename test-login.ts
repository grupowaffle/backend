// Teste de login com senha master
const testMasterLogin = async () => {
  const email = 'master@system';
  const password = 'waffle_master_2025_secure_!@#2025$%_QwErTyUiOp1234567890';

  console.log('🔑 Testando login com senha master...');
  console.log('📧 Email:', email);
  console.log('🔒 Password:', password);

  try {
    const response = await fetch('http://127.0.0.1:8787/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Login realizado com sucesso!');
      console.log('🎫 Token:', data.data?.token);
      console.log('👤 User:', data.data?.user);
    } else {
      console.log('❌ Erro no login:', data);
    }
  } catch (error) {
    console.error('❌ Erro na requisição:', error);
  }
};

testMasterLogin();