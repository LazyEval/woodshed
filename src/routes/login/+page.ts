export const load = ({ url }: { url: URL }) => ({ error: url.searchParams.get('error') });
