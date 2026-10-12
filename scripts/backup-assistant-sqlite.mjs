import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = process.env.ASSISTANT_STORAGE_ROOT ?? '/data/tenants';
const backupRoot = process.env.ASSISTANT_BACKUP_ROOT ?? '/backups';
const mismatchMarker = path.join(
    backupRoot,
    '.assistant-registry-mismatch',
);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(backupRoot, { recursive: true, mode: 0o700 });
const tenants = await readdir(sourceRoot, { withFileTypes: true }).catch(
    () => [],
);
let backedUp = 0;
const sourceKeys = [];
const snapshotKeys = [];
for (const tenant of tenants) {
    if (!tenant.isDirectory() || !/^[a-f0-9]{64}$/.test(tenant.name)) continue;
    sourceKeys.push(tenant.name);
    const source = path.join(sourceRoot, tenant.name, 'assistant.sqlite');
    const targetDir = path.join(backupRoot, stamp, tenant.name);
    await mkdir(targetDir, { recursive: true, mode: 0o700 });
    let db;
    try {
        db = new DatabaseSync(source, { readOnly: true });
    } catch {
        console.error(
            `assistant_source_unreadable sources=${sourceKeys.length} backed_up=${backedUp}`,
        );
        process.exit(1);
    }
    try {
        // VACUUM INTO is a transactionally consistent snapshot of the live WAL DB.
        const target = path
            .join(targetDir, 'assistant.sqlite')
            .replaceAll("'", "''");
        db.exec(`VACUUM INTO '${target}'`);
        const snapshot = new DatabaseSync(target, { readOnly: true });
        try {
            const integrity = snapshot.prepare('PRAGMA integrity_check').get();
            if (integrity?.integrity_check !== 'ok') {
                throw new Error('ASSISTANT_BACKUP_INTEGRITY_FAILED');
            }
        } finally {
            snapshot.close();
        }
        backedUp++;
        snapshotKeys.push(tenant.name);
    } finally {
        db.close();
    }
}
const registryKeys = await registryStorageKeys();
if (registryKeys !== null) {
    const sourceSet = new Set(sourceKeys);
    const snapshotSet = new Set(snapshotKeys);
    const missingSources = registryKeys.filter((key) => !sourceSet.has(key));
    const missingSnapshots = registryKeys.filter(
        (key) => !snapshotSet.has(key),
    );
    const extraSnapshots = snapshotKeys.filter(
        (key) => !sourceSet.has(key),
    );
    if (
        missingSources.length > 0 ||
        missingSnapshots.length > 0 ||
        extraSnapshots.length > 0
    ) {
        const detail =
            `assistant_registry_storage_mismatch registry=${registryKeys.length} sources=${sourceKeys.length} snapshots=${snapshotKeys.length} missing_sources=${missingSources.length} missing_snapshots=${missingSnapshots.length} extra_snapshots=${extraSnapshots.length}`;
        await mkdir(backupRoot, { recursive: true, mode: 0o700 });
        const { writeFile } = await import('node:fs/promises');
        await writeFile(
            mismatchMarker,
            `${detail} stamp=${stamp}\n`,
            { mode: 0o600 },
        );
        console.error(detail);
        process.exit(1);
    }
    const { rm } = await import('node:fs/promises');
    await rm(mismatchMarker, { force: true });
}
console.log(
    `assistant_sqlite_backup_complete count=${backedUp} stamp=${stamp}`,
);

/** Sanitized aggregate only: distinct registry storage keys (opaque hashes).
 * ASSISTANT_TEST_REGISTRY_KEYS is a test-only override (comma-separated).
 * Returns null when no main database is configured or reachable, so the
 * backup itself is never blocked by this observability check. */
async function registryStorageKeys() {
    const override = process.env.ASSISTANT_TEST_REGISTRY_KEYS;
    if (override !== undefined) {
        return override
            .split(',')
            .map((key) => key.trim())
            .filter((key) => /^[a-f0-9]{64}$/.test(key));
    }
    if (!process.env.DATABASE_URL) {
        if (process.env.ASSISTANT_ALLOW_UNCHECKED_BACKUP === 'true') return null;
        const { writeFile } = await import('node:fs/promises');
        const detail = `assistant_registry_unavailable stamp=${stamp}`;
        await writeFile(mismatchMarker, `${detail}\n`, { mode: 0o600 });
        console.error(detail);
        process.exit(1);
    }
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    try {
        const rows =
            await prisma.$queryRaw`SELECT DISTINCT "storageKey" AS "key" FROM "AssistantDurableBinding"`;
        const keys = (Array.isArray(rows) ? rows : [])
            .map((row) => row?.key)
            .filter(
                (key) => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key),
            );
        return [...new Set(keys)];
    } catch {
        if (process.env.ASSISTANT_ALLOW_UNCHECKED_BACKUP === 'true') return null;
        const { writeFile } = await import('node:fs/promises');
        const detail = `assistant_registry_unavailable stamp=${stamp}`;
        await writeFile(mismatchMarker, `${detail}\n`, { mode: 0o600 });
        console.error(detail);
        process.exit(1);
    } finally {
        await prisma.$disconnect().catch(() => {});
    }
}
