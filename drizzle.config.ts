import type { Config } from 'drizzle-kit';

const migrationsDir = './drizzle';

export default {
  schema: './src/main/db/schema.ts',
  out: migrationsDir,
  dialect: 'sqlite',
  dbCredentials: {
    url: `${migrationsDir}/app.sqlite`,
  },
} satisfies Config;
