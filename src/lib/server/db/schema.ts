import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type {
	Chart,
	GenerationRecord,
	SimplifiedChartOrigin,
	SourceChartStatus
} from '#lib/chart.js';
import type { CalendarDate, PracticedChart, Rating } from '#lib/rotation.js';

export const sessions = sqliteTable('sessions', {
	tokenHash: text('token_hash').primaryKey(),
	expiresAt: integer('expires_at').notNull()
});

export const loginFailures = sqliteTable('login_failures', {
	clientId: text('client_id').primaryKey(),
	count: integer('count').notNull(),
	windowStart: integer('window_start').notNull()
});

export const tunes = sqliteTable('tunes', {
	id: text('id').primaryKey(),
	title: text('title').notNull(),
	composer: text('composer'),
	key: text('key'),
	sourceChart: text('source_chart', { mode: 'json' }).$type<Chart>().notNull(),
	sourceChartStatus: text('source_chart_status')
		.$type<SourceChartStatus>()
		.notNull()
		.default('draft'),
	verifiedAt: integer('verified_at'),
	verifiedChart: text('verified_chart', { mode: 'json' }).$type<Chart>(),
	shelved: integer('shelved', { mode: 'boolean' }).notNull().default(false),
	scanPageCount: integer('scan_page_count').notNull().default(0),
	scanVersion: integer('scan_version').notNull().default(0),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
});

export const practiceSessions = sqliteTable(
	'practice_sessions',
	{
		id: text('id').primaryKey(),
		tuneId: text('tune_id')
			.notNull()
			.references(() => tunes.id, { onDelete: 'cascade' }),
		practicedOn: text('practiced_on').$type<CalendarDate>().notNull(),
		rating: text('rating').$type<Rating>().notNull(),
		chart: text('chart').$type<PracticedChart>(),
		createdAt: integer('created_at').notNull()
	},
	(table) => [index('practice_sessions_tune_idx').on(table.tuneId, table.practicedOn)]
);

export const simplifiedCharts = sqliteTable(
	'simplified_charts',
	{
		id: text('id').primaryKey(),
		tuneId: text('tune_id')
			.notNull()
			.references(() => tunes.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		origin: text('origin').$type<SimplifiedChartOrigin>().notNull(),
		chart: text('chart', { mode: 'json' }).$type<Chart>().notNull(),
		generation: text('generation', { mode: 'json' }).$type<GenerationRecord>(),
		flaggedBars: text('flagged_bars', { mode: 'json' }).$type<number[]>().notNull().default([]),
		archivedAt: integer('archived_at'),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(table) => [index('simplified_charts_tune_idx').on(table.tuneId, table.createdAt)]
);

export const rules = sqliteTable('rules', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	text: text('text').notNull(),
	createdAt: integer('created_at').notNull(),
	updatedAt: integer('updated_at').notNull()
});
