# Woodshed

Personal practice tool for jazz standards.

- **Import** a chart from a scan or photo. Claude extracts the chord grid, you fix and verify it.
- **Simplify** the changes, either by hand or by having Claude apply your own plain-language rules.
- **Rotate** your repertoire. Log practice sessions with a rating and get a list of tunes due for a refresh.

## Docs

- [CONTEXT.md](./CONTEXT.md): domain glossary
- [docs/adr/](./docs/adr/): architecture decision records

## Stack

TypeScript, SvelteKit on Cloudflare Workers, D1, R2, Claude API.
