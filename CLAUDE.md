# Woodshed

Personal practice tool for jazz standards. SvelteKit on Cloudflare Workers, D1 (Drizzle), R2.

## Conventions

- Domain vocabulary lives in `docs/CONTEXT.md`. Use those terms exactly in code, tests and UI; respect the _Avoid_ lists.
- Architecture decisions live in `docs/adr/`. Read the relevant ones before changing an area; add a new ADR for decisions of similar weight.
- TypeScript strict. Format with Prettier, lint with ESLint, typecheck with `svelte-check`.
- Import from `src/lib` via the `#lib/...js` subpath alias, not relative paths across directories.
- Workers free plan: 10 ms CPU per request. No heavy CPU work in the Worker (e.g. image resizing happens in the browser).

## Testing

- Test at the server-API seam only: call the server request handlers (`Request` in, `Response` out) inside the Workers runtime (`@cloudflare/vitest-plugin`) against local D1/R2. No tests of internals, no mocking of internal collaborators.
- Routing is the exception: `tests/routing.test.ts` sends browser-style requests (`SELF.fetch`) to the built worker (`npm test` runs `vite build` first) so hooks and SvelteKit routes are covered. Keep it to a few requests proving wiring; behavior is tested at the handler seam.
- Time goes through the injectable `Clock`; the AI goes through the injectable `AiClient` port. Tests use `tests/support/fake-clock.ts` and `tests/support/fake-ai.ts` via `createTestApp()`.
- Real D1 and R2 are used in tests; migrations in `drizzle/` are applied automatically.

## Structure

- `src/hooks.server.ts`: builds `Deps`, runs the auth `guard` on every request (default deny; only the login page and its submit endpoint are public).
- `src/lib/server/`: server-only code. `deps.ts` is the composition root (`Deps` = db, clock, ai, scans, secrets).
- `src/lib/server/db/schema.ts`: Drizzle schema. After changing it run `npm run db:generate` and commit the migration in `drizzle/`.
- Route `+server.ts` files stay thin: delegate to a function in `src/lib/server/` taking `(request, deps)`.

## Commands

See README.
