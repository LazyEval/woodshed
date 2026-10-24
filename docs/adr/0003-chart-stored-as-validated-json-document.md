# Charts are stored as a validated JSON document on the Tune

A Chart is sections of bars of beat-placed chord symbols, always read and written whole: displayed as a grid, edited as a grid, handed to the AI as a grid. We store the Source Chart as a JSON column on the tune row, validated by the shared `validateChart` in `src/lib/chart.ts` on every write, instead of normalized section/bar/chord tables. D1 round trips are cheap to avoid, whole-chart reads need no joins, and Simplified Charts can reuse the same document shape and compare bar grids structurally.

## Consequences

- Nothing in SQL can query inside a chart (e.g. "tunes containing Dm7"); search beyond title would need a derived index.
- The chart shape is versioned only by code; a change to it needs a data migration over the JSON.
- Validation lives in one place shared by server and editor, so the API is the only gate to stored charts.
