# The rotation schedule is derived from Practice Sessions on read, in calendar dates

A Tune's next Due date is never stored. Every read replays its Practice Sessions in date order through the scheduler in `src/lib/rotation.ts`, starting from the date the Source Chart was first Verified. Backdating or deleting a session therefore needs no recomputation step, and tuning the scheduler constants re-schedules every Tune at once. A single user's history is small enough that replaying it for the Due list stays well inside the Worker CPU budget.

Sessions and Due dates are calendar dates (`YYYY-MM-DD`), not instants, because intervals are whole days: a Tune practiced in the evening should be Due the next day, not 24 hours later. "Today" is the server clock read in the `TIME_ZONE` var, since the Worker has no notion of the user's zone.

## Consequences

- Nothing in SQL can filter by Due date; the Due list loads all Active Tunes and their sessions.
- If history grows large enough to matter, cache the replayed state on the Tune and invalidate it on session writes.
- Changing `TIME_ZONE` can shift "today" by a day; stored dates are unaffected.
- A Tune is in rotation once first Verified and while not Shelved; otherwise it has no Due date, though its sessions are kept. Reopening a Verified Source Chart keeps it in rotation, Due from its first verification.
