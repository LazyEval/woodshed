import type { Result } from '#lib/result.js';

export const MAX_NAME_LENGTH = 100;

export function parseName(value: unknown): Result<string> {
	if (typeof value !== 'string' || !value.trim()) return { error: 'Name is required.' };
	if (value.trim().length > MAX_NAME_LENGTH) return { error: 'Name is too long.' };
	return { value: value.trim() };
}
