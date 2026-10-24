import { createAnthropicAiClient } from '#lib/server/anthropic.js';
import { unconfiguredAiClient, type AiClient } from '#lib/server/ai.js';
import { systemClock, type Clock } from '#lib/server/clock.js';
import { createDb, type Db } from '#lib/server/db/index.js';

export interface Deps {
	db: Db;
	clock: Clock;
	ai: AiClient;
	scans: R2Bucket;
	appPassword: string;
	sessionKey: string;
}

export function createDeps(env: Cloudflare.Env, overrides: Partial<Deps> = {}): Deps {
	return {
		db: createDb(env.DB),
		clock: systemClock,
		ai: env.ANTHROPIC_API_KEY
			? createAnthropicAiClient(env.ANTHROPIC_API_KEY)
			: unconfiguredAiClient,
		scans: env.SCANS,
		appPassword: env.APP_PASSWORD,
		sessionKey: env.SESSION_KEY,
		...overrides
	};
}
