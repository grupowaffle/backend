/**
 * Buscar post FRESCO direto da API BeehIV (não do banco)
 */

const BEEHIIV_API_KEY = process.env.BEEHIIV_API_KEY;
const PUBLICATION_ID = 'pub_ce78b549-5923-439b-be24-3f24c454bc12'; // The News

async function fetchFreshPost() {
  const url = `https://api.beehiiv.com/v2/publications/${PUBLICATION_ID}/posts?expand=free_rss_content&order_by=publish_date&limit=1&direction=desc&status=confirmed`;

  console.log('📡 Fetching from BeehIV API...\n');

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${BEEHIIV_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const data = await response.json();
  const post = data.data[0];

  if (!post) {
    console.log('❌ No posts found');
    return;
  }

  console.log(`✅ Post: "${post.title}"`);
  console.log(`   ID: ${post.id}`);
  console.log(`   Status: ${post.status}\n`);

  // Show RSS structure
  console.log('📋 RSS Content structure:');
  console.log('Type:', typeof post.content?.free?.rss);
  console.log('Length:', post.content?.free?.rss?.length || 0);
  console.log('\n📄 RSS Sample (2000-4000):');
  console.log(post.content?.free?.rss?.substring(2000, 4000));

  // Save to file for inspection
  const fs = require('fs');
  fs.writeFileSync('beehiiv-raw-response.json', JSON.stringify(post, null, 2));
  console.log('\n💾 Full response saved to: beehiiv-raw-response.json');
}

fetchFreshPost()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
