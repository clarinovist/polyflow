import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Node 26 exposes node:sqlite, but the root app typecheck uses Node typings
// that do not yet declare it. Keep the native runtime contract explicit.
// @ts-expect-error -- node:sqlite is available in the pinned Node 26 runtime.
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const roots: string[] = [];
const script = path.resolve(
    process.cwd(),
    'scripts/backup-assistant-sqlite.mjs',
);
const restrictedKey = createHash('sha256')
    .update('polyflow:restricted-telegram-public:v1')
    .digest('hex');

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
        const storageKey = restrictedKey;
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
                ASSISTANT_ALLOW_UNCHECKED_BACKUP: 'true',
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

    it('requires the reserved restricted source even when the registry is empty', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'assistant-backup-'));
        roots.push(root);
        const sourceRoot = path.join(root, 'sources');
        const backupRoot = path.join(root, 'backups');
        await mkdir(sourceRoot, { recursive: true });
        let failed = false;
        try {
            await execute(process.execPath, [script], {
                env: {
                    ...process.env,
                    ASSISTANT_STORAGE_ROOT: sourceRoot,
                    ASSISTANT_BACKUP_ROOT: backupRoot,
                    ASSISTANT_TEST_REGISTRY_KEYS: '',
                },
            });
        } catch (error) {
            failed = true;
            const output =
                (error as { stdout?: string; stderr?: string }).stdout ?? '';
            const stderr =
                (error as { stdout?: string; stderr?: string }).stderr ?? '';
            expect(output + stderr).toContain(
                'assistant_restricted_storage_missing',
            );
        }
        expect(failed).toBe(true);
    });

    it('requires the reserved restricted source when runtime storage already exists', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'assistant-backup-'));
        roots.push(root);
        const sourceRoot = path.join(root, 'sources');
        const backupRoot = path.join(root, 'backups');
        const ordinaryKey = 'a'.repeat(64);
        const sourceDirectory = path.join(sourceRoot, ordinaryKey);
        await mkdir(sourceDirectory, { recursive: true });
        const database = new DatabaseSync(
            path.join(sourceDirectory, 'assistant.sqlite'),
        );
        database.exec('CREATE TABLE fixture (value TEXT NOT NULL);');
        database.close();
        let failed = false;
        try {
            await execute(process.execPath, [script], {
                env: {
                    ...process.env,
                    ASSISTANT_STORAGE_ROOT: sourceRoot,
                    ASSISTANT_BACKUP_ROOT: backupRoot,
                    ASSISTANT_TEST_REGISTRY_KEYS: ordinaryKey,
                },
            });
        } catch (error) {
            failed = true;
            const output =
                (error as { stdout?: string; stderr?: string }).stdout ?? '';
            const stderr =
                (error as { stdout?: string; stderr?: string }).stderr ?? '';
            expect(output + stderr).toContain(
                'assistant_restricted_storage_missing',
            );
        }
        expect(failed).toBe(true);
    });

    it('fails closed when registry validation is configured but unreachable', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'assistant-backup-'));
        roots.push(root);
        const sourceRoot = path.join(root, 'sources');
        const backupRoot = path.join(root, 'backups');
        const sourceDirectory = path.join(sourceRoot, restrictedKey);
        await mkdir(sourceDirectory, { recursive: true });
        const database = new DatabaseSync(
            path.join(sourceDirectory, 'assistant.sqlite'),
        );
        database.exec('CREATE TABLE fixture (value TEXT NOT NULL);');
        database.close();
        let failed = false;
        try {
            await execute(process.execPath, [script], {
                env: {
                    ...process.env,
                    ASSISTANT_STORAGE_ROOT: sourceRoot,
                    ASSISTANT_BACKUP_ROOT: backupRoot,
                    DATABASE_URL:
                        'postgresql://postgres@127.0.0.1:1/unreachable?connect_timeout=1',
                    ASSISTANT_ALLOW_UNCHECKED_BACKUP: 'false',
                },
                timeout: 10_000,
            });
        } catch (error) {
            failed = true;
            const output =
                (error as { stdout?: string; stderr?: string }).stdout ?? '';
            const stderr =
                (error as { stdout?: string; stderr?: string }).stderr ?? '';
            expect(output + stderr).toContain('assistant_registry_unavailable');
        }
        expect(failed).toBe(true);
    });

    it('fails closed when the registry holds a storage key with no source', async () => {
        const root = await mkdtemp(path.join(tmpdir(), 'assistant-backup-'));
        roots.push(root);
        const sourceRoot = path.join(root, 'sources');
        const backupRoot = path.join(root, 'backups');
        const storageKey = restrictedKey;
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
