import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { ExecFileException } from 'node:child_process';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '../tenant-migrations';
import {
    runTenantMigratorCli,
    type TenantMigratorCliDependencies,
} from '../../../../scripts/migrate-all-tenants';

const moduleMocks = vi.hoisted(() => ({
    prisma: vi.fn(),
    execFile: vi.fn(),
}));
vi.mock('@prisma/client', () => ({ PrismaClient: moduleMocks.prisma }));
vi.mock('node:child_process', () => ({ execFile: moduleMocks.execFile }));

const url = 'postgresql://synthetic:pa"ss$(noop);`noop`&%25@db.invalid/one?schema=public&x=%22';
const laterUrl = 'postgresql://synthetic:secret@db.invalid/two';
const cliPath = '/synthetic/node_modules/prisma/build/index.js';

function setup(urls: Array<string | null> = [url]) {
    const registry = {
        tenant: { findMany: vi.fn().mockResolvedValue(urls.map((dbUrl) => ({ dbUrl }))) },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    };
    const dependencies = {
        createRegistry: vi.fn(() => registry),
        resolvePrismaCli: vi.fn(() => cliPath),
        execPath: '/synthetic/node',
        cwd: vi.fn(() => '/synthetic/app'),
        env: { NODE_ENV: 'test', DATABASE_URL: 'postgresql://synthetic:secret@db.invalid/main', PATH: '/synthetic/bin' },
        execute: vi.fn<TenantMigratorCliDependencies['execute']>()
            .mockImplementation((_file, _args, _options, callback) => { callback(null); }),
        log: vi.fn(),
        error: vi.fn(),
        setExitCode: vi.fn(),
    } satisfies TenantMigratorCliDependencies;
    return { registry, dependencies };
}

function commandError(properties: Partial<ExecFileException>): ExecFileException {
    return Object.assign(new Error(`secret stderr and command: ${url}`), properties);
}

describe('tenant migrator CLI adapter', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(() => { vi.restoreAllMocks(); });

    it('does not construct Prisma or launch a process on import', () => {
        expect(moduleMocks.prisma).not.toHaveBeenCalled();
        expect(moduleMocks.execFile).not.toHaveBeenCalled();
    });

    it('passes the exact URL only via a fresh env, using local Prisma argv and no shell', async () => {
        const { registry, dependencies } = setup([url, laterUrl]);
        const exit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('premature exit'); });
        await runTenantMigratorCli(dependencies);
        expect(dependencies.execute).toHaveBeenNthCalledWith(1,
            '/synthetic/node', [cliPath, 'migrate', 'deploy'],
            {
                env: { ...dependencies.env, DATABASE_URL: url },
                cwd: '/synthetic/app', shell: false, encoding: 'utf8',
            }, expect.any(Function),
        );
        expect(dependencies.execute.mock.calls[1][2].env.DATABASE_URL).toBe(laterUrl);
        expect(dependencies.execute.mock.calls[0][2].env).not.toBe(dependencies.env);
        expect(dependencies.env.DATABASE_URL).toContain('/main');
        expect(dependencies.resolvePrismaCli).toHaveBeenCalledTimes(2);
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(0);
        expect(dependencies.error).not.toHaveBeenCalled();
        expect(dependencies.log).toHaveBeenLastCalledWith(
            'Tenant migrations: selected=2, attempted=2, migrated=2, failures=0',
        );
        expect(JSON.stringify(dependencies.log.mock.calls)).not.toContain(url);
        expect(exit).not.toHaveBeenCalled();
    });

    it.each([
        [{ code: 1 }, 'MIGRATION_FAILED'],
        [{}, 'MIGRATION_FAILED'],
        [{ code: 'ENOENT' }, 'MIGRATION_LAUNCH_FAILED'],
        [{ code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' }, 'MIGRATION_LAUNCH_FAILED'],
        [{ killed: true }, 'MIGRATION_INTERRUPTED'],
        [{ signal: 'SIGTERM' }, 'MIGRATION_INTERRUPTED'],
    ] as const)('sanitizes command error %j and continues to later tenants', async (properties, category) => {
        const { dependencies } = setup([url, laterUrl]);
        dependencies.execute.mockImplementationOnce((_file, _args, _options, callback) => {
            callback(commandError(properties));
        });
        await runTenantMigratorCli(dependencies);
        expect(dependencies.execute).toHaveBeenCalledTimes(2);
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(dependencies.error).toHaveBeenCalledExactlyOnceWith(`[tenant #1] ${category}`);
        expect(dependencies.log).toHaveBeenLastCalledWith(
            'Tenant migrations: selected=2, attempted=2, migrated=1, failures=1',
        );
        expect(JSON.stringify([dependencies.error.mock.calls, dependencies.log.mock.calls])).not.toContain(url);
    });

    it.each(['resolver', 'execute', 'cwd'] as const)('handles synchronous %s failure and continues', async (failure) => {
        const { registry, dependencies } = setup([url, laterUrl]);
        const throwSensitive = () => { throw new Error(url); };
        if (failure === 'resolver') dependencies.resolvePrismaCli.mockImplementationOnce(throwSensitive);
        if (failure === 'execute') dependencies.execute.mockImplementationOnce(throwSensitive);
        if (failure === 'cwd') dependencies.cwd.mockImplementationOnce(throwSensitive);
        await runTenantMigratorCli(dependencies);
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(dependencies.error).toHaveBeenCalledExactlyOnceWith('[tenant #1] MIGRATION_LAUNCH_FAILED');
        expect(dependencies.log).toHaveBeenLastCalledWith(
            'Tenant migrations: selected=2, attempted=2, migrated=1, failures=1',
        );
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
    });

    it.each([null, undefined, '', '  ', 'invalid', 'file:///tmp/db', 'postgresql://db.invalid'])(
        'does not migrate an invalid URL %# or fall back to inherited main DATABASE_URL', async (invalid) => {
            const { registry, dependencies } = setup([invalid as string | null]);
            await runTenantMigratorCli(dependencies);
            expect(dependencies.resolvePrismaCli).not.toHaveBeenCalled();
            expect(dependencies.execute).not.toHaveBeenCalled();
            expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
            expect(registry.$disconnect).toHaveBeenCalledTimes(1);
        },
    );

    it.each(['init', 'query', 'disconnect'] as const)('fails closed for registry %s errors', async (failure) => {
        const { registry, dependencies } = setup();
        if (failure === 'init') dependencies.createRegistry.mockImplementation(() => { throw new Error(url); });
        if (failure === 'query') registry.tenant.findMany.mockRejectedValue(new Error(url));
        if (failure === 'disconnect') registry.$disconnect.mockRejectedValue(new Error(url));
        await runTenantMigratorCli(dependencies);
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(dependencies.error).toHaveBeenCalledExactlyOnceWith(`[registry] REGISTRY_${failure.toUpperCase()}_FAILED`);
        expect(registry.$disconnect).toHaveBeenCalledTimes(failure === 'init' ? 0 : 1);
        expect(dependencies.execute).toHaveBeenCalledTimes(failure === 'disconnect' ? 1 : 0);
    });

    it('aggregates multiple errors and sets status only after cleanup', async () => {
        const { registry, dependencies } = setup([null, url, laterUrl]);
        dependencies.execute.mockImplementationOnce((_file, _args, _options, callback) => { callback(commandError({ code: 1 })); });
        registry.$disconnect.mockRejectedValue(new Error(url));
        dependencies.setExitCode.mockImplementation(() => { expect(registry.$disconnect).toHaveBeenCalledTimes(1); });
        await runTenantMigratorCli(dependencies);
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(dependencies.error.mock.calls).toEqual([
            ['[tenant #1] MISSING_DATABASE_URL'],
            ['[tenant #2] MIGRATION_FAILED'],
            ['[registry] REGISTRY_DISCONNECT_FAILED'],
        ]);
    });

    it('returns zero only after disconnect when no tenants are active', async () => {
        const { registry, dependencies } = setup([]);
        await runTenantMigratorCli(dependencies);
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
        expect(dependencies.execute).not.toHaveBeenCalled();
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(0);
    });

    it('sanitizes unexpected adapter errors and fails closed after core cleanup', async () => {
        const { registry, dependencies } = setup();
        dependencies.log.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error(url); });
        await runTenantMigratorCli(dependencies);
        expect(registry.$disconnect).toHaveBeenCalledTimes(1);
        expect(dependencies.setExitCode).toHaveBeenLastCalledWith(1);
        expect(dependencies.error).toHaveBeenCalledExactlyOnceWith('TENANT_MIGRATOR_FAILED');
    });
});

// Execute the actual CommonJS entry guard in memory. Every external dependency
// is a fake: this does not launch Node/Prisma, load dotenv or open any database.
describe('compiled CommonJS CLI entry guard and default wiring', () => {
    const source = readFileSync(resolve('scripts/migrate-all-tenants.ts'), 'utf8');
    const compiled = transpileModule(source, {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 },
    }).outputText;

    it.each([
        { direct: false, fail: false },
        { direct: true, fail: false },
        { direct: true, fail: true },
    ])('guards imports and propagates exitCode ($direct, failure=$fail)', async ({ direct, fail }) => {
        const { registry } = setup();
        const prisma = vi.fn(function () { return registry; });
        const execute = vi.fn((_file, _args, _options, callback) => {
            // Simulate child output containing secrets; the adapter must ignore it.
            callback(fail ? commandError({ code: 1 }) : null, `stdout ${url}`, `stderr ${url}`);
        });
        const moduleStub = { exports: {} };
        const fakeRequire = Object.assign((id: string) => {
            if (id === '@prisma/client') return { PrismaClient: prisma };
            if (id === 'node:child_process') return { execFile: execute };
            if (id === '../src/lib/ops/tenant-migrations') return core;
            throw new Error(`Unexpected module: ${id}`);
        }, { main: direct ? moduleStub : {}, resolve: vi.fn(() => cliPath) });
        const fakeProcess = {
            execPath: '/synthetic/node', cwd: () => '/synthetic/app',
            env: { DATABASE_URL: 'synthetic-main-fallback' },
            exitCode: undefined as number | undefined,
            exit: vi.fn(() => { throw new Error('premature exit'); }),
        };
        const logger = { log: vi.fn(), error: vi.fn() };
        runInNewContext(compiled, {
            require: fakeRequire, module: moduleStub, exports: moduleStub.exports,
            process: fakeProcess, console: logger,
        });
        if (direct) {
            await vi.waitFor(() => { expect(fakeProcess.exitCode).toBe(fail ? 1 : 0); });
            expect(prisma).toHaveBeenCalledTimes(1);
            expect(execute).toHaveBeenCalledWith('/synthetic/node', [cliPath, 'migrate', 'deploy'], {
                cwd: '/synthetic/app', env: { DATABASE_URL: url }, shell: false, encoding: 'utf8',
            }, expect.any(Function));
            expect(fakeRequire.resolve).toHaveBeenCalledExactlyOnceWith('prisma/build/index.js');
            expect(registry.$disconnect).toHaveBeenCalledTimes(1);
            expect(logger.error.mock.calls).toEqual(fail ? [['[tenant #1] MIGRATION_FAILED']] : []);
            expect(JSON.stringify([logger.log.mock.calls, logger.error.mock.calls])).not.toContain(url);
        } else {
            expect(prisma).not.toHaveBeenCalled();
            expect(execute).not.toHaveBeenCalled();
            expect(fakeProcess.exitCode).toBeUndefined();
        }
        expect(fakeProcess.exit).not.toHaveBeenCalled();
    });
});
