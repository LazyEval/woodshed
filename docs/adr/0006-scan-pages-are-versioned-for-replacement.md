# Scan pages are versioned for Replacement

A Tune stores `scanVersion`; Scan pages live at `scans/<tuneId>/v<version>/<page>`. Version 0 keeps the original unversioned key `scans/<tuneId>/<page>` so Scans stored before Replacement existed need no R2 migration.

Replacement writes the new pages under `version + 1`, then commits the Source Chart, page count, version and archiving in one D1 batch, then deletes the previous version's pages best-effort. A failure before the batch leaves the old Scan intact; a failure after it leaves only orphaned objects.

The Scan image URL carries `?v=<scanVersion>` so browsers do not serve cached pages of the replaced Scan.

Alternative rejected: overwriting pages in place, which loses the old Scan if the D1 write fails after the R2 writes.
