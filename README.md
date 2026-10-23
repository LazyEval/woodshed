# Woodshed

Personal practice tool for jazz standards.

- **Import** a chart from a scan or photo. Claude extracts the chord grid, you fix and verify it.
- **Simplify** the changes, either by hand or by having Claude apply your own plain-language rules.
- **Rotate** your repertoire. Log practice sessions with a rating and get a list of tunes due for a refresh.

## Docs

- [CONTEXT.md](./docs/CONTEXT.md): domain glossary
- [docs/adr/](./docs/adr/): architecture decision records

## Stack

TypeScript, SvelteKit on Cloudflare Workers, D1, R2, Claude API.

## Development

Requires Node 22 (`.nvmrc`).

```sh
npm install
cp .dev.vars.example .dev.vars   # local APP_PASSWORD and SESSION_KEY
npm run db:migrate:local         # create local D1 tables
npm run dev
```

| Command                                          | What                                             |
| ------------------------------------------------ | ------------------------------------------------ |
| `npm run dev`                                    | Dev server with local D1/R2 bindings             |
| `npm run preview`                                | Production build served by `wrangler dev`        |
| `npm run check`                                  | Typecheck (`svelte-check`)                       |
| `npm run lint`                                   | Prettier check + ESLint                          |
| `npm run format`                                 | Prettier write                                   |
| `npm test`                                       | Tests in the Workers runtime (Vitest)            |
| `npm run db:generate`                            | Generate a Drizzle migration after schema change |
| `npm run db:migrate:local` / `db:migrate:remote` | Apply D1 migrations                              |
| `npm run types`                                  | Regenerate `worker-configuration.d.ts`           |

Tests exercise the server request handlers (`Request` to `Response`) against local D1/R2 with a fake clock and fake AI client. See `CLAUDE.md`.

## Auth

Single shared password. `POST /login` compares it in constant time against the `APP_PASSWORD` secret, then sets a signed (`SESSION_KEY`), HttpOnly, Secure, SameSite=Lax cookie valid 180 days. Sessions are stored in D1 so logout revokes them. Five failed logins per client IP in 15 minutes locks that IP out for the rest of the window. Every route except `/login` requires a session; unauthenticated GETs redirect to `/login`, other methods get 401.

## Deploy

CI (`.github/workflows/ci.yml`) runs typecheck, lint and tests on every PR. Merging to `main` runs `.github/workflows/deploy.yml`: CI, D1 migrations, then `wrangler deploy` with the app secrets.

One-time setup:

1. `npx wrangler d1 create woodshed` and put the returned `database_id` in `wrangler.jsonc`.
2. `npx wrangler r2 bucket create woodshed-scans`.
3. Add GitHub repository secrets:
   - `CLOUDFLARE_API_TOKEN`: token with Workers Scripts, D1 and R2 edit permissions on the account.
   - `CLOUDFLARE_ACCOUNT_ID`
   - `APP_PASSWORD`: the login password.
   - `SESSION_KEY`: random signing key, e.g. `openssl rand -base64 32`. Rotating it logs everyone out.

Install on a phone via the browser's "Add to Home Screen" (web manifest in `static/`).
