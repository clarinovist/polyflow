import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const sourceRoot = process.env.ASSISTANT_STORAGE_ROOT ?? '/data/tenants';
const backupRoot = process.env.ASSISTANT_BACKUP_ROOT ?? '/backups';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await mkdir(backupRoot, { recursive: true, mode: 0o700 });
const tenants = await readdir(sourceRoot, { withFileTypes: true }).catch(
    () => [],
);
let backedUp = 0;
for (const tenant of tenants) {
    if (!tenant.isDirectory() || !/^[a-f0-9]{64}$/.test(tenant.name)) continue;
    const source = path.join(sourceRoot, tenant.name, 'assistant.sqlite');
    const targetDir = path.join(backupRoot, stamp, tenant.name);
    await mkdir(targetDir, { recursive: true, mode: 0o700 });
    const db = new DatabaseSync(source, { readOnly: true });
    try {
        // VACUUM INTO is a transactionally consistent snapshot of the live WAL DB.
        const target = path
            .join(targetDir, 'assistant.sqlite')
            .replaceAll("'", "''");
        db.exec(`VACUUM INTO '${target}'`);
        backedUp++;
    } finally {
        db.close();
    }
}
console.log(
    `assistant_sqlite_backup_complete count=${backedUp} stamp=${stamp}`,
);
