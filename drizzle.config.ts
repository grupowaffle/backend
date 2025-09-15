import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/config/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.NEON_URL || process.env.DATABASE_URL!,
  },
});