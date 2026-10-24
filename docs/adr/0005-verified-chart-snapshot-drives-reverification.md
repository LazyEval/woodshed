# Verified chart snapshot drives re-verification

A Tune stores a snapshot of its Source Chart as of the last verification (`verifiedChart`). Reopening leaves Simplified Charts untouched; on re-verification the snapshot is compared with the edited Source Chart.

- Same bar grid (Correction): bars whose chords differ from the snapshot are added to each non-archived Simplified Chart's `flaggedBars`. Flags are cleared per bar by the user.
- Different bar grid: non-archived Simplified Charts get `archivedAt` set. The API refuses unless the request carries `confirmArchive: true`, and answers 409 with the chart names so the UI can name them in its prompt.
- Tune status change and Simplified Chart updates run in one D1 batch.

Alternatives rejected: diffing at save time (flags would churn while the Draft is still being corrected, and edit-then-revert would leave stale flags); snapshotting at reopen (equivalent but a second write on a path that can fail halfway).
