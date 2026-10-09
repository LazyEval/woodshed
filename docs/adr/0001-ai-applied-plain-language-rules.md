# Rules are plain-language instructions applied by an AI, not a code rule engine

Simplification Rules are a handful of short tricks the user writes in plain English ("VI and III chords become I"). A Generation hands the Source Chart, its Key Centers and the chosen Rules to Claude, which returns a Simplified Chart on the same bar grid with a reason per changed bar. We chose this over a coded functional-harmony engine or a pattern DSL because the rules are few, informal and evolving, and jazz harmony edge cases (turnarounds, secondary dominants, tritone subs) are better judged than pattern-matched; the user reviews and hand-edits the result anyway.

## Consequences

- Generations are non-deterministic and cost a few cents each; the app must validate that the returned chart keeps the Source Chart's exact bar grid.
- Regenerating creates a new Simplified Chart rather than overwriting, since output can't be reproduced.
