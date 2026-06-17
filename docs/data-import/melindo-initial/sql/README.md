# Melindo Master Import SQL Prep

Files:
- `melindo-customers-upsert.sql` — update-by-name then insert-missing for `Customer`
- `melindo-suppliers-upsert.sql` — update-by-name then insert-missing for `Supplier`
- `melindo-master-import-preflight.sql` — quick read-only preflight check
- `melindo-master-import-verify.sql` — post-import count check
- `melindo-customers-upsert-dry-run.sql` — same customer import wrapped to `ROLLBACK`
- `melindo-suppliers-upsert-dry-run.sql` — same supplier import wrapped to `ROLLBACK`

Execution pattern (read-only preflight):
- `./scripts/tenant-psql-read.sh melindo docs/data-import/melindo-initial/sql/melindo-master-import-preflight.sql`

Execution pattern (write):
- `./scripts/tenant-psql-write.sh melindo docs/data-import/melindo-initial/sql/melindo-customers-upsert.sql`
- `./scripts/tenant-psql-write.sh melindo docs/data-import/melindo-initial/sql/melindo-suppliers-upsert.sql`

Validation already performed:
- preflight on live `melindo_rafia` confirmed:
  - customer exact-name matches: 17
  - supplier exact-name matches: 9
- dry-run rollback on live `melindo_rafia` succeeded:
  - customers: 146 staging -> 17 updates + 129 inserts
  - suppliers: 53 staging -> 9 updates + 44 inserts

Notes:
- SQL matches rows by exact `name`
- Existing non-empty `code` values are preserved
- New generated codes were regenerated with live-DB awareness to avoid unique-code collisions
- Non-empty incoming staging fields overwrite empty or older values
- `notes` are appended without duplicating the exact incoming note string
- These files target `melindo_rafia` only via the tenant wrapper scripts
