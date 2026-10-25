export const MAX_SCAN_PAGES = 12;
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const scanKey = (tuneId: string, version: number, page: number) =>
	version === 0 ? `scans/${tuneId}/${page}` : `scans/${tuneId}/v${version}/${page}`;

export const scanArchiveName = (tuneId: string, page: number) => `scans/${tuneId}/${page}`;
