import { getDrizzleClient } from './src/config/db';
import { eq } from 'drizzle-orm';
import { beehiivPublications } from './src/config/db/schema';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);

const PUB_ID = 'pub_ce78b549-5923-439b-be24-3f24c454bc12';
const NEW_NAME = 'The news';

db.update(beehiivPublications)
  .set({ name: NEW_NAME })
  .where(eq(beehiivPublications.beehiivId, PUB_ID))
  .then(() => {
    console.log(`✅ Updated publication ${PUB_ID} name to "${NEW_NAME}"`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });