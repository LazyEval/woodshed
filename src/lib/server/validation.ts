import type { AiModel } from '#lib/server/ai.js';
import type { Result } from '#lib/result.js';

export const MAX_NAME_LENGTH = 100;

export function parseName(value: unknown): Result<string> {
	if (typeof value !== 'string' || !value.trim()) return { error: 'Name is required.' };
	if (value.trim().length > MAX_NAME_LENGTH) return { error: 'Name is too long.' };
	return { value: value.trim() };
}

export const MODEL_ERROR = 'Model must be sonnet or opus.';

export function parseModel(value: unknown): AiModel | null {
	if (value === undefined || value === null || value === '' || value === 'sonnet') return 'sonnet';
	return value === 'opus' ? 'opus' : null;
}
