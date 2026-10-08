import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const entrypoint = readFileSync(resolve('entrypoint.sh'), 'utf8');
const migrator = readFileSync(resolve('release-migrate.sh'), 'utf8');
let harness: ReturnType<typeof createHarness>;

beforeAll(() => { harness = createHarness(); });
afterAll(() => { rmSync(harness.directory, { recursive: true, force: true }); });

function createHarness() {
    const directory = mkdtempSync(join(tmpdir(), 'release-migrator-entrypoint-'));
    const bin = join(directory, 'bin');
    const calls = join(directory, 'calls.txt');
    const backup = join(directory, 'backups');
    mkdirSync(bin);
    mkdirSync(backup);
    writeFileSync(calls, '');
    const node = join(bin, 'node');
    writeFileSync(node, '#!/bin/sh\n' +
        'case "$1" in\n' +
        '  scripts/backup-release-databases.js)\n' +
        '    [ "$#" = 1 ] || exit 89\n' +
        '    echo backup >> "$TEST_CALLS"\n' +
        '    exit "$TEST_BACKUP_STATUS" ;;\n' +
        '  node_modules/prisma/build/index.js)\n' +
        '    [ "$#" = 3 ] && [ "$2" = migrate ] && [ "$3" = deploy ] || exit 90\n' +
        '    echo main-migration >> "$TEST_CALLS"\n' +
        '    exit "$TEST_MAIN_STATUS" ;;\n' +
        '  scripts/migrate-all-tenants.js)\n' +
        '    [ "$#" = 1 ] || exit 91\n' +
        '    echo tenant-migrations >> "$TEST_CALLS"\n' +
        '    exit "$TEST_TENANT_STATUS" ;;\n' +
        '  server.js)\n' +
        '    [ "$#" = 1 ] || exit 92\n' +
        '    echo server >> "$TEST_CALLS"\n' +
        '    exit "$TEST_SERVER_STATUS" ;;\n' +
        '  *) exit 93 ;;\n' +
        'esac\n');
    chmodSync(node, 0o700);
    const rm = join(bin, 'rm');
    writeFileSync(rm, '#!/bin/sh\nexit 0\n');
    chmodSync(rm, 0o700);
    const date = join(bin, 'date');
    writeFileSync(date, '#!/bin/sh\necho 20000101_000000\n');
    chmodSync(date, 0o700);
    return { directory, bin, calls, backup };
}

function run(script: string, overrides: Record<string, string> = {}) {
    writeFileSync(harness.calls, '');
    const result = spawnSync('/bin/sh', ['-c', script], {
        cwd: harness.directory,
        env: {
            NODE_ENV: 'test', PATH: `${harness.bin}:/bin:/usr/bin`, HOME: harness.directory,
            DATABASE_URL: 'postgresql://synthetic:secret@db.invalid/main',
            BACKUP_DIR: harness.backup, TEST_CALLS: harness.calls,
            TEST_BACKUP_STATUS: '0', TEST_MAIN_STATUS: '0',
            TEST_TENANT_STATUS: '0', TEST_SERVER_STATUS: '0', ...overrides,
        },
        encoding: 'utf8', timeout: 5_000,
    });
    expect(result.error, 'stdout: ' + result.stdout + '; stderr: ' + result.stderr).toBeUndefined();
    return { ...result, calls: readFileSync(harness.calls, 'utf8').trim().split('\n').filter(Boolean) };
}

describe('runtime and release migration entrypoints (fake commands only)', () => {
    it('normal startup launches only the web server', () => {
        const result = run(entrypoint, { TEST_MAIN_STATUS: '17', TEST_TENANT_STATUS: '18' });
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(['server']);
        expect(result.stdout).toContain('Starting application...');
    });

    it('runs a fail-closed snapshot, main migration, then active-tenant migrations exactly once', () => {
        const result = run(migrator);
        expect(result.status).toBe(0);
        expect(result.calls).toEqual(['backup', 'main-migration', 'tenant-migrations']);
        expect(result.stdout).toContain('Release migrations completed.');
    });

    it('fails before migrations when the snapshot fails', () => {
        const result = run(migrator, { TEST_BACKUP_STATUS: '16' });
        expect(result.status).toBe(16);
        expect(result.calls).toEqual(['backup']);
    });

    it('does not start tenant migrations when the main migration fails', () => {
        const result = run(migrator, { TEST_MAIN_STATUS: '17' });
        expect(result.status).toBe(17);
        expect(result.calls).toEqual(['backup', 'main-migration']);
    });

    it('propagates a tenant migration failure', () => {
        const result = run(migrator, { TEST_TENANT_STATUS: '18' });
        expect(result.status).toBe(18);
        expect(result.calls).toEqual(['backup', 'main-migration', 'tenant-migrations']);
        expect(result.stdout).not.toContain('Release migrations completed.');
    });
});
