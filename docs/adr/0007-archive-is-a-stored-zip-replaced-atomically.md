# Archive is a stored zip, replaced atomically

Export is one zip with no compression: `manifest.json` (versioned JSON of all Tunes, Source Charts, Key Centers, Simplified Charts including archived, Practice Sessions, Rules) plus `scans/<tuneId>/<page>`. Scan images are already compressed and base64 inside JSON would add a third in size and CPU, which the Worker's 10 ms budget cannot afford. Entries are copied byte for byte. Import does not CRC-check entries for the same reason; it validates the manifest and checks every Scan page exists.

Import validates the whole archive (same chart validators as the API), then writes Scan pages under fresh versions (as in ADR 0006), swaps every D1 row in one `db.batch` (a single transaction), and only then deletes every R2 object not referenced by the new data. A failure before the batch leaves existing data intact and only orphaned new objects, which are removed.

Replacing needs explicit confirmation: without `confirmReplace=true` the endpoint validates and answers 409 with counts. The manifest omits `scanVersion`, a storage detail, so export then import reproduces the data exactly.

Risk: validating a very large manifest may exceed the CPU budget. If it does, unzip and parse in the browser and send chunks.
