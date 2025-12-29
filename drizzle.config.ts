import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;
const isPostgres = databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'));

export default defineConfig({
	// Use different schema files for SQLite vs PostgreSQL
	schema: isPostgres
		? './src/lib/server/db/schema/pg-schema.ts'
		: './src/lib/server/db/schema/index.ts',
	out: isPostgres ? './drizzle-pg' : './drizzle',
	dialect: isPostgres ? 'postgresql' : 'sqlite',
	dbCredentials: isPostgres
		? { url: databaseUrl! }
		: { url: `file:${process.env.DATA_DIR || './data'}/dockhand.db` }
});
