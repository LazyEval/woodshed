import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
	const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle'));

	return {
		plugins: [
			cloudflareTest({
				main: './tests/support/worker.ts',
				wrangler: { configPath: './wrangler.jsonc' },
				miniflare: {
					bindings: {
						APP_PASSWORD: 'correct horse battery staple',
						SESSION_KEY: 'test-session-key-0123456789abcdef',
						TEST_MIGRATIONS: migrations
					}
				}
			})
		],
		test: {
			include: ['tests/**/*.test.ts'],
			setupFiles: ['./tests/support/apply-migrations.ts']
		}
	};
});
