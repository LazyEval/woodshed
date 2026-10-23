import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
	tokenHash: text('token_hash').primaryKey(),
	expiresAt: integer('expires_at').notNull()
});

export const loginFailures = sqliteTable('login_failures', {
	clientId: text('client_id').primaryKey(),
	count: integer('count').notNull(),
	windowStart: integer('window_start').notNull()
});
