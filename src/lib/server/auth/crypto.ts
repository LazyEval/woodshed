const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

export function randomToken(byteLength = 32): string {
	return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function hmacSha256(key: string, message: string): Promise<Uint8Array> {
	const cryptoKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode(key),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
}

export async function sha256Hex(message: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(message)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
	return diff === 0;
}

/**
 * HMAC-ing both sides first makes the inputs equal-length, so neither the
 * password's length nor its prefix leaks through comparison timing.
 */
export async function secretsMatch(key: string, supplied: string, expected: string) {
	const [a, b] = await Promise.all([hmacSha256(key, supplied), hmacSha256(key, expected)]);
	return timingSafeEqual(a, b);
}
