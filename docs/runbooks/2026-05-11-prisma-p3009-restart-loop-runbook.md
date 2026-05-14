# Prisma P3009 Restart Loop Recovery Runbook

Date: 2026-05-11
Owner: Platform / Backend
Scope: polyflow-app restart loop caused by Prisma migration state conflict

## Incident Pattern

This incident happens when:
1. A migration is manually applied with SQL.
2. _prisma_migrations is manually edited and does not match Prisma engine expectation.
3. App startup runs prisma migrate deploy in entrypoint.
4. Prisma throws P3009 and container exits.
5. Docker restart policy causes endless restart loop.

## Symptoms

1. Container keeps restarting.
2. Logs show Prisma migrate deploy failure with P3009.
3. Application cannot stay healthy long enough to serve traffic.

## Immediate Containment (Stop the Loop)

1. Set SKIP_MIGRATIONS=1 in deployment environment.
2. Restart service:
   - docker compose up -d polyflow
3. Verify app stays up:
   - docker ps
   - docker logs --tail=200 polyflow-app

Expected result:
- App starts without running migrations.
- User traffic is restored while migration state is repaired.

## Controlled Recovery (Repair Migration State)

Important:
- Use Prisma CLI version 5.22.0 for all commands.
- Do not manually insert checksum rows into _prisma_migrations.

For each affected database (example: polyflow and melindo_rafia):

1. Point DATABASE_URL to one database at a time.
2. Remove only the conflicted migration row:
   - DELETE FROM "_prisma_migrations"
     WHERE migration_name = '20260511000000_production_execution_uom_audit';
3. Mark migration as applied via Prisma resolve:
   - npx prisma@5.22.0 migrate resolve --applied 20260511000000_production_execution_uom_audit --schema prisma/schema.prisma
4. Validate migration state:
   - npx prisma@5.22.0 migrate status --schema prisma/schema.prisma

Expected result:
- No failed migration state for the target migration.
- Status does not report unresolved failure for this migration.

## Return to Normal Startup

1. Set SKIP_MIGRATIONS back to 0.
2. Restart service:
   - docker compose up -d polyflow
3. Validate startup logs:
   - docker logs --tail=300 polyflow-app
4. Confirm app health and business smoke test.

Expected result:
- Entrypoint runs migrate deploy successfully.
- Container remains stable.

## Verification Checklist

1. docker ps shows polyflow-app with stable uptime.
2. Startup logs contain no P3009.
3. migrate status clean on all affected databases.
4. Core flows smoke tested (login, dashboard load, one transactional write).

## Post-Incident Hardening

1. Keep SKIP_MIGRATIONS support in deployment as break-glass control.
2. Standardize all operational Prisma commands to version 5.22.0.
3. Avoid direct manual edits to _prisma_migrations except explicit recovery playbook.
4. Add deployment checklist step: run migrate status before restart.
5. Consider one-time migration guard in entrypoint:
   - If P3009 detected, log actionable message and skip hard exit in emergency mode.

## Quick Command Block

Containment:
- SKIP_MIGRATIONS=1 docker compose up -d polyflow

Recover one DB:
- npx prisma@5.22.0 migrate resolve --applied 20260511000000_production_execution_uom_audit --schema prisma/schema.prisma
- npx prisma@5.22.0 migrate status --schema prisma/schema.prisma

Back to normal:
- SKIP_MIGRATIONS=0 docker compose up -d polyflow

## Related Files

- entrypoint.sh
- docker-compose.yml
- prisma/schema.prisma
