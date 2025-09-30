import { neon } from '@neondatabase/serverless';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.dev.vars' });

async function recreateTables() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_PROD;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔄 Connecting to Neon database...');
  const sql = neon(databaseUrl);

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, 'recreate-media-simple.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');

    // Split SQL statements by semicolon and execute them one by one
    const statements = sqlContent
      .split(';')
      .filter(stmt => stmt.trim())
      .map(stmt => stmt.trim() + ';');

    console.log(`📝 Executing ${statements.length} SQL statements...`);

    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 50) + '...');
        await sql.query(statement);
      }
    }

    console.log('✅ Tables recreated successfully!');

    // Verify the table structure
    console.log('\n📋 Verifying media_files table structure...');
    const result = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'media_files'
      ORDER BY ordinal_position;
    `;

    console.log('\nMedia_files table columns:');
    result.forEach(col => {
      console.log(`- ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

  } catch (error) {
    console.error('❌ Error recreating tables:', error);
    process.exit(1);
  }
}

recreateTables().catch(console.error);