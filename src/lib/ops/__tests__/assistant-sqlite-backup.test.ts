import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];
const script = path.resolve(
    process.cwd(),
    'scripts/backup-assistant-sqlite.mjs',
);

afterEach(async () => {
    await Promise.all(
        roots.splice(0).map((root) =>
            rm(root, { recursive: true, force: true }),
        ),
    );
});

describe('durable assistant SQLite backup', () => {
    it('creates an integrity-checked snapshot for every durable source', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'assistant-backup-'));
        roots.push(root);
        const sourceRoot = path.join(root, 'sources');
        const backupRoot = path.join(root, 'backups');
        const storageKey = 'a'.repeat(64);
        const sourceDirectory = path.join(sourceRoot, storageKey);
        await mkdir(sourceDirectory, { recursive: true });
        const source = path.join(sourceDirectory, 'assistant.sqlite');
        const database = new DatabaseSync(source);
        database.exec(
            'CREATE TABLE fixture (value TEXT NOT NULL);' +
                "INSERT INTO fixture (value) VALUES ('durable');",
        );
        database.close();

        const result = await execute(process.execPath, [script], {
            env: {
                ...process.env,
                ASSISTANT_STORAGE_ROOT: sourceRoot,
                ASSISTANT_BACKUP_ROOT: backupRoot,
            },
        });
        expect(result.stdout).toContain(
            'assistant_sqlite_backup_complete count=1',
        );

        const [stamp] = await readdir(backupRoot);
        const snapshotPath = path.join(
            backupRoot,
            stamp,
            storageKey,
            'assistant.sqlite',
        );
        const snapshot = new DatabaseSync(snapshotPath, { readOnly: true });
        try {
            expect(snapshot.prepare('PRAGMA integrity_check').get()).toEqual({
                integrity_check: 'ok',
            });
            expect(
                snapshot.prepare('SELECT value FROM fixture').get(),
            ).toEqual({ value: 'durable' });
        } finally {
            snapshot.close();
        }
    });

    it('fails closed when the registry holds a storage key with no source', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'assistant-backup-'));
        roots.push(root);
        const sourceRoot = path.join(root, 'sources');
        const backupRoot = path.join(root, 'backups');
        const storageKey = 'a'.repeat(64);
        const sourceDirectory = path.join(sourceRoot, storageKey);
        await mkdir(sourceDirectory, { recursive: true });
        const source = path.join(sourceDirectory, 'assistant.sqlite');
        const database = new DatabaseSync(source);
        database.exec('CREATE TABLE fixture (value TEXT NOT NULL);');
        database.close();

        const missingKey = 'b'.repeat(64);
        let failed = false;
        try {
            await execute(process.execPath, [script], {
                env: {
                    ...process.env,
                    ASSISTANT_STORAGE_ROOT: sourceRoot,
                    ASSISTANT_BACKUP_ROOT: backupRoot,
                    ASSISTANT_TEST_REGISTRY_KEYS: `${storageKey},${missingKey}`,
                },
            });
        } catch (error) {
            failed = true;
            const output =
                (error as { stdout?: string; stderr?: string }).stdout ?? '';
            const stderr =
                (error as { stdout?: string; stderr?: string }).stderr ?? '';
            expect(output + stderr).toContain(
                'assistant_registry_storage_mismatch',
            );
            expect(output + stderr).not.toContain(missingKey);
        }
        expect(failed).toBe(true);
    });
});
