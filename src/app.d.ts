import type { Deps } from '#lib/server/deps.js';

declare global {
	namespace App {
		interface Locals {
			deps: Deps;
		}
	}

	namespace Cloudflare {
		interface Env {
			APP_PASSWORD: string;
			SESSION_KEY: string;
		}
	}
}

export {};
