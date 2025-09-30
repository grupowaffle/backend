import { getDrizzleClient } from './src/config/db';
import { BeehiivRepository } from './src/repositories';

const env = { DATABASE_URL: process.env.DATABASE_URL };
const db = getDrizzleClient(env);
const repo = new BeehiivRepository(db);

repo.listActivePublications()
  .then(pubs => {
    console.log('\n📚 Publications in database:\n');
    pubs.forEach(pub => {
      console.log(`ID: ${pub.id}`);
      console.log(`BeehIV ID: ${pub.beehiivId}`);
      console.log(`Name: ${pub.name}`);
      console.log(`---`);
    });
  })
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });