# Host on Cloudflare Workers + D1 + R2 (free tier)

The app must be reachable from phone and laptop with synced data and must keep the Anthropic API key server-side, but the user has no server. We chose SvelteKit on Cloudflare Workers with D1 (SQLite) for data and R2 for Scans: $0 for a single user, no ops, HTTPS included, and one language (TypeScript) end to end.

## Considered Options

- Fly.io with Node + SQLite on a volume: ~$2–5/mo and more ops for no gain at this scale.
- Python (FastAPI) backend with a JS frontend: user knows Python, but the app is UI-heavy and would need two languages and duplicated chord models.

## Consequences

- Workers free plan allows 10 ms CPU per request (I/O waits excluded): image resizing happens in the browser before upload, never in the Worker.
- A client disconnect can cancel an in-flight Claude call; extraction and Generation must be safely retryable.
- Full JSON + Scan export/import exists partly as the exit path off Cloudflare.
