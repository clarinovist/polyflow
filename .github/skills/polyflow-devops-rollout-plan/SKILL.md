---
name: polyflow-devops-rollout-plan
description: 'Plan PolyFlow deployments, database migrations, container rollouts, verification checks, and rollback steps for production-safe releases.'
---

# PolyFlow DevOps Rollout Plan

Use this skill when you need to prepare a safe deployment or production change for PolyFlow.

## When to Use This Skill

Use this skill when the request involves:
- deploying a new build or container image
- changing Docker Compose, Dockerfile, or entrypoint behavior
- running or sequencing Prisma migrations in production
- planning a rollback, backup, or recovery path
- validating GitHub Actions release or deployment steps

## Workflow

1. Read the deployment and release context.
   - `docs/DEPLOYMENT.md`
   - `.github/workflows/production.yml`
   - `docker-compose.yml`
   - `docker-compose.dev.yml`
   - `Dockerfile`
   - `entrypoint.sh`
   - `package.json`
2. Check what the release already does.
   - Build, test, and image publish steps in GitHub Actions
   - Database sync and migration scripts in `scripts/`
   - Runtime assumptions such as `DATABASE_URL`, `NEXTAUTH_URL`, and registry credentials
3. Build a rollout plan with explicit phases.
   - Preconditions and approvals
   - Backup and migration steps
   - Deployment sequencing
   - Post-deploy verification
   - Rollback and recovery
4. Include the exact commands the operator should run.
   - `npm run lint`
   - `npm run test:run`
   - `npm run build`
   - `npx prisma migrate deploy`
   - `docker compose pull`
   - `docker compose up -d`
   - any repo-specific backup or sync scripts
5. Call out failure signals and stop conditions.
   - image pull failures
   - migration failures
   - auth or database misconfiguration
   - stale container or bad health-check outcomes

## Guidance

- Prefer reversible steps and verify before progressing.
- Make backups explicit before destructive operations.
- Keep production and development commands separated.
- Treat deploys as idempotent where possible.
- If the change affects database schema, include both forward and rollback assumptions.

## References

- `docs/DEPLOYMENT.md`
- `.github/workflows/production.yml`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `Dockerfile`
- `entrypoint.sh`
- `scripts/sync-db-prod.sh`
- `scripts/push-db-to-prod.sh`
- `scripts/migrate-all-tenants.ts`
- `scripts/backup-db.sh`
- `package.json`