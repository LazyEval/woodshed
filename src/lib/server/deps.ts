import { unconfiguredAiClient, type AiClient } from './ai';
import { systemClock, type Clock } from './clock';
import { createDb, type Db } from './db';

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
		ai: unconfiguredAiClient,
		scans: env.SCANS,
		appPassword: env.APP_PASSWORD,
		sessionKey: env.SESSION_KEY,
		...overrides
	};
}
