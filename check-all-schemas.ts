import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.dev.vars' });

async function checkAllSchemas() {
  const databaseUrl = process.env.DATABASE_URL || process.env.NEON_PROD;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  console.log('🔍 Checking all table schemas...');
  const sql = neon(databaseUrl);

  // Expected schemas for main CMS tables
  const expectedSchemas = {
    articles: [
      'id', 'title', 'slug', 'content', 'excerpt', 'status', 'publishedAt',
      'scheduledFor', 'seoTitle', 'seoDescription', 'seoKeywords', 'categoryId',
      'tags', 'source', 'sourceId', 'sourceUrl', 'newsletter', 'isFeatured',
      'featuredPosition', 'featuredUntil', 'featuredCategory', 'featuredBy',
      'featuredAt', 'featuredImageId', 'featuredImage', 'galleryIds', 'authorId',
      'editorId', 'views', 'shares', 'likes', 'createdAt', 'updatedAt'
    ],
    categories: [
      'id', 'name', 'slug', 'description', 'parentId', 'color', 'icon', 'order',
      'isActive', 'featuredOnHomepage', 'seoTitle', 'seoDescription', 'createdAt', 'updatedAt'
    ],
    authors: [
      'id', 'name', 'slug', 'bio', 'avatar', 'email', 'socialLinks', 'expertise',
      'location', 'isActive', 'featuredAuthor', 'articleCount', 'createdAt', 'updatedAt'
    ],
    media: [
      'id', 'filename', 'originalName', 'mimeType', 'size', 'width', 'height',
      'url', 'storagePath', 'externalUrl', 'alt', 'caption', 'description',
      'folder', 'tags', 'source', 'sourceMetadata', 'beehiivOriginalUrl',
      'isCached', 'cachePath', 'processedVersions', 'optimizationStatus',
      'uploadedBy', 'isActive', 'createdAt', 'updatedAt'
    ]
  };

  try {
    for (const [tableName, expectedColumns] of Object.entries(expectedSchemas)) {
      console.log(`\n🔍 Checking ${tableName} table...`);

      // Check if table exists
      const tableExists = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = ${tableName}
        );
      `;

      if (!tableExists[0].exists) {
        console.log(`❌ ${tableName} table does not exist`);
        continue;
      }

      // Get table structure
      const result = await sql`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = ${tableName}
        ORDER BY ordinal_position;
      `;

      const actualColumns = result.map(col => col.column_name);
      const missing = expectedColumns.filter(col => !actualColumns.includes(col));
      const extra = actualColumns.filter(col => !expectedColumns.includes(col));

      console.log(`   Expected: ${expectedColumns.length} columns`);
      console.log(`   Actual: ${actualColumns.length} columns`);

      if (missing.length > 0) {
        console.log(`   ❌ Missing: ${missing.join(', ')}`);
      }

      if (extra.length > 0) {
        console.log(`   ➕ Extra: ${extra.join(', ')}`);
      }

      if (missing.length === 0 && extra.length === 0) {
        console.log(`   ✅ Schema matches perfectly!`);
      }
    }

    console.log('\n🔍 Summary completed!');

  } catch (error) {
    console.error('❌ Error checking schemas:', error);
  }
}

checkAllSchemas().catch(console.error);