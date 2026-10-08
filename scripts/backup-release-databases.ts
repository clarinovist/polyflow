import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
    backupReleaseDatabases,
    ReleaseBackupError,
    type ReleaseBackupRegistry,
} from '../src/lib/ops/release-database-backups';

export interface ReleaseBackupCliDependencies {
    mainDatabaseUrl: unknown;
    backupDir: string;
    createRegistry(): ReleaseBackupRegistry;
    execute(file: string, args: string[]): Promise<void>;
    now(): Date;
    log(message: string): void;
    error(message: string): void;
}

const defaults: ReleaseBackupCliDependencies = {
    mainDatabaseUrl: process.env.DATABASE_URL,
    backupDir: process.env.BACKUP_DIR ?? '/app/backups',
    createRegistry: () => new PrismaClient(),
    execute: (file, args) => new Promise((resolve, reject) => {
        execFile(file, args, { shell: false, encoding: 'utf8' }, (error) => error ? reject(error) : resolve());
    }),
    now: () => new Date(),
    log: (message) => console.log(message),
    error: (message) => console.error(message),
};

export async function runReleaseBackupCli(
    dependencies: ReleaseBackupCliDependencies = defaults,
): Promise<number> {
    await mkdir(dependencies.backupDir, { recursive: true });
    const stamp = dependencies.now().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const result = await backupReleaseDatabases({
        mainDatabaseUrl: dependencies.mainDatabaseUrl,
        createRegistry: dependencies.createRegistry,
        backup: async (databaseUrl, ordinal) => {
            const target = join(dependencies.backupDir, `release_${stamp}_${ordinal}.dump`);
            try {
                await dependencies.execute('pg_dump', [databaseUrl, '-F', 'c', '-f', target]);
                if ((await stat(target)).size < 100) throw new ReleaseBackupError('BACKUP_FAILED');
                try { await dependencies.execute('pg_restore', ['--list', target]); }
                catch { throw new ReleaseBackupError('BACKUP_VERIFY_FAILED'); }
            } catch (error) {
                await rm(target, { force: true });
                throw error;
            }
        },
    });
    for (const failure of result.failures) {
        dependencies.error(`[database #${failure.databaseNumber ?? 0}] ${failure.category}`);
    }
    dependencies.log(
        `Release backups: selected=${result.selected}, backedUp=${result.backedUp}, failures=${result.failures.length}`,
    );
    return result.failures.length ? 1 : 0;
}

if (require.main === module) {
    void runReleaseBackupCli().then((code) => { process.exitCode = code; }).catch(() => {
        console.error('RELEASE_BACKUP_FAILED');
        process.exitCode = 1;
    });
}
