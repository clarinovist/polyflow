import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const entrypoint = readFileSync(resolve('entrypoint.sh'), 'utf8');
let harness: ReturnType<typeof createHarness>;

beforeAll(() => { harness = createHarness(); });
afterAll(() => { rmSync(harness.directory, { recursive: true, force: true }); });

function createHarness() {
    const directory = mkdtempSync(join(tmpdir(), 'tenant-migrator-entrypoint-'));
    const bin = join(directory, 'bin');
    const backup = join(directory, 'backups');
    const calls = join(directory, 'calls.txt');
    mkdirSync(bin);
    mkdirSync(backup);
    writeFileSync(calls, '');

    const commandStubs: Record<string, string> = {
        node: `
case "$1" in
  node_modules/prisma/build/index.js)
    [ "$#" = 3 ] && [ "$2" = migrate ] && [ "$3" = deploy ] || exit 90
    echo main-migration >> "$TEST_CALLS"
    exit "$TEST_MAIN_STATUS" ;;
  scripts/migrate-all-tenants.js)
    [ "$#" = 1 ] || exit 91
    echo tenant-migrations >> "$TEST_CALLS"
    exit "$TEST_TENANT_STATUS" ;;
  server.js)
    [ "$#" = 1 ] || exit 91
    echo server >> "$TEST_CALLS"
    exit 0 ;;
  *) exit 92 ;;
esac`,
        pg_dump: `
[ "$#" = 5 ] && [ "$1" = "$DATABASE_URL" ] && [ "$2" = -F ] && [ "$3" = c ] && [ "$4" = -f ] || exit 93
[ "$5" = "$TEST_BACKUP_DIR/db_snapshot_20000101_000000.dump" ] || exit 94
echo backup >> "$TEST_CALLS"
exit "$TEST_BACKUP_STATUS"`,
        mkdir: `
[ "$#" = 2 ] && [ "$1" = -p ] && [ "$2" = "$TEST_BACKUP_DIR" ] || exit 95
exit 0`,
        date: 'echo 20000101_000000',
        // No cleanup commands may reach a real filesystem utility. No output
        // enters the pipe, and xargs/rm are inert even if the script changes.
        ls: 'exit 0',
        tail: 'exit 0',
        xargs: 'exit 0',
        rm: 'exit 0',
    };
    // Shell functions avoid spawning even fake child binaries and their startup
    // overhead. Unknown external commands cannot run: PATH
    // is an empty temporary directory. All stubs use shell builtins only.
    const stubs = Object.entries(commandStubs)
        .map(([name, body]) => `${name}() {\n${body.replace(/\bexit\b/g, 'return')}\n}`)
        .join('\n');
    return { directory, bin, backup, calls, stubs };
}

function runEntrypoint(overrides: Record<string, string> = {}) {
    const { directory, bin, backup, calls, stubs } = harness;
    writeFileSync(calls, '');
    // Relocate only the hardcoded backup directory in-memory. All control flow
    // is the real entrypoint; the repository script remains untouched. The env
    // is not inherited from the developer shell.
    expect(entrypoint.match(/BACKUP_DIR="\/app\/backups"/g)).toHaveLength(1);
    const isolatedEntrypoint = entrypoint.replace('BACKUP_DIR="/app/backups"', 'BACKUP_DIR="$TEST_BACKUP_DIR"');
    const result = spawnSync('/bin/sh', ['-c', `${stubs}\n${isolatedEntrypoint}`], {
        cwd: directory,
        env: {
            NODE_ENV: 'test',
            PATH: bin,
            HOME: directory,
            DATABASE_URL: 'postgresql://synthetic:secret@db.invalid/main',
            TEST_CALLS: calls,
            TEST_BACKUP_DIR: backup,
            TEST_MAIN_STATUS: '0',
            TEST_TENANT_STATUS: '0',
            TEST_BACKUP_STATUS: '0',
            ...overrides,
        },
        encoding: 'utf8',
        timeout: 5_000,
    });
    expect(result.error, `stdout: ${result.stdout}; stderr: ${result.stderr}`).toBeUndefined();
    expect(result.signal).toBeNull();
    return {
        ...result,
        calls: readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
    };
}

describe('entrypoint migration startup gate (fake commands only)', () => {
    it('starts the fake server after main and tenant migrations succeed', () => {
        const result = runEntrypoint();
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(['backup', 'main-migration', 'tenant-migrations', 'server']);
        expect(result.stdout).toContain('Starting application...');
    });

    it('blocks tenant migration and server when the main migration fails', () => {
        const result = runEntrypoint({ TEST_MAIN_STATUS: '17' });
        expect(result.status).toBe(17);
        expect(result.calls).toEqual(['backup', 'main-migration']);
        expect(result.stdout).not.toContain('Starting application...');
    });

    it('blocks server startup on nonzero tenant migration status', () => {
        const result = runEntrypoint({ TEST_TENANT_STATUS: '1' });
        expect(result.status).toBe(1);
        expect(result.calls).toEqual(['backup', 'main-migration', 'tenant-migrations']);
        expect(result.stdout).not.toContain('Starting application...');
    });

    it.each(['1', 'true'])('retains explicit SKIP_MIGRATIONS=%s behavior', (skip) => {
        const result = runEntrypoint({ SKIP_MIGRATIONS: skip, TEST_MAIN_STATUS: '17', TEST_TENANT_STATUS: '1' });
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(['server']);
        expect(result.stdout).toContain('Skipping Prisma migrations');
    });

    it.each(['0', 'false', 'TRUE'])('does not skip migrations for SKIP_MIGRATIONS=%s', (skip) => {
        const result = runEntrypoint({ SKIP_MIGRATIONS: skip, TEST_TENANT_STATUS: '1' });
        expect(result.status).toBe(1);
        expect(result.calls).toEqual(['backup', 'main-migration', 'tenant-migrations']);
    });

    it('retains backup-failure continuation without weakening migration failure gates', () => {
        const result = runEntrypoint({ TEST_BACKUP_STATUS: '2', TEST_TENANT_STATUS: '1' });
        expect(result.status).toBe(1);
        expect(result.calls).toEqual(['backup', 'main-migration', 'tenant-migrations']);
        expect(result.stdout).toContain('Backup failed, continuing anyway...');
    });

    it('skips only the snapshot when DATABASE_URL is absent', () => {
        const result = runEntrypoint({ DATABASE_URL: '' });
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(['main-migration', 'tenant-migrations', 'server']);
        expect(result.stdout).toContain('DATABASE_URL not found, skipping pre-migration snapshot');
    });
});
