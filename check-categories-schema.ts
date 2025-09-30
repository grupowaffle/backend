import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.dev.vars' });

async function checkCategoriesSchema() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_PROD;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔍 Checking categories table schema...');
  const sql = neon(databaseUrl);

  try {
    // Check if categories table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'categories'
      );
    `;

    if (!tableExists[0].exists) {
      console.log('❌ Categories table does not exist');
      return;
    }

    console.log('✅ Categories table exists');

    // Get table structure
    const result = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'categories'
      ORDER BY ordinal_position;
    `;

    console.log('\n📋 Categories table columns:');
    result.forEach((col, index) => {
      console.log(`${index + 1}. ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''} ${col.column_default ? `DEFAULT ${col.column_default}` : ''}`);
    });

    console.log(`\nTotal columns: ${result.length}`);

    // Expected columns from schema
    const expectedColumns = [
      'id',
      'name',
      'slug',
      'description',
      'parentId',
      'color',
      'icon',
      'order',
      'isActive',
      'featuredOnHomepage',
      'seoTitle',
      'seoDescription',
      'createdAt',
      'updatedAt'
    ];

    console.log('\n🔍 Expected columns:', expectedColumns.length);
    console.log('📊 Actual columns:', result.length);

    const actualColumns = result.map(col => col.column_name);
    const missing = expectedColumns.filter(col => !actualColumns.includes(col));
    const extra = actualColumns.filter(col => !expectedColumns.includes(col));

    if (missing.length > 0) {
      console.log('\n❌ Missing columns:', missing);
    }

    if (extra.length > 0) {
      console.log('\n➕ Extra columns:', extra);
    }

    if (missing.length === 0 && extra.length === 0) {
      console.log('\n✅ Schema matches perfectly!');
    }

  } catch (error) {
    console.error('❌ Error checking categories schema:', error);
  }
}

checkCategoriesSchema().catch(console.error);