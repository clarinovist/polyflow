import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '../performance-metrics-cleanup';
import {
    runPerformanceMetricCleanupCli,
    type PerformanceMetricCleanupCliDependencies,
} from '../../../../scripts/cleanup-performance-metrics';

const { prismaConstructor } = vi.hoisted(() => ({ prismaConstructor: vi.fn() }));
vi.mock('@prisma/client', () => ({ PrismaClient: prismaConstructor }));

const NOW = new Date('2026-09-14T12:00:00.000Z');
const rawError = new Error('sensitive database exception');

function makeDb(count: number) {
    return {
        performanceMetric: { deleteMany: vi.fn().mockResolvedValue({ count }) },
        $disconnect: vi.fn().mockResolvedValue(undefined),
    };
}

function fixture() {
    const main = {
        ...makeDb(5),
        tenant: { findMany: vi.fn().mockResolvedValue([
            { id: 't1', name: 'Tenant A', dbUrl: 'postgres://a/metrics' },
            { id: 't2', name: 'Tenant B', dbUrl: 'postgres://b/metrics' },
        ]) },
    };
    const first = makeDb(2);
    const second = makeDb(3);
    const dependencies = {
        createMainClient: vi.fn(() => main),
        createTenantClient: vi.fn<(url: string) => ReturnType<typeof makeDb>>()
            .mockReturnValueOnce(first).mockReturnValueOnce(second),
        now: vi.fn(() => NOW),
        logger: { log: vi.fn(), error: vi.fn() },
        setExitCode: vi.fn(),
    } satisfies PerformanceMetricCleanupCliDependencies;
    return { main, first, second, dependencies };
}

function output(dependencies: ReturnType<typeof fixture>['dependencies']) {
    return JSON.stringify([
        ...dependencies.logger.log.mock.calls,
        ...dependencies.logger.error.mock.calls,
    ]);
}

describe('performance metrics CLI adapter (real adapter and core)', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does not construct Prisma clients or execute cleanup on import', async () => {
        vi.resetModules();
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exitCodeBefore = process.exitCode;
        try {
            const imported = await import('../../../../scripts/cleanup-performance-metrics');
            expect(imported.runPerformanceMetricCleanupCli).toBeTypeOf('function');
            expect(prismaConstructor).not.toHaveBeenCalled();
            expect(log).not.toHaveBeenCalled();
            expect(error).not.toHaveBeenCalled();
            expect(process.exitCode).toBe(exitCodeBefore);
        } finally {
            log.mockRestore();
            error.mockRestore();
        }
    });

    it('uses default retention, ordered ACTIVE tenants, reports totals and releases every owned client', async () => {
        const { main, first, second, dependencies } = fixture();
        const report = await runPerformanceMetricCleanupCli(dependencies);
        expect(report.hasFailure).toBe(false);
        expect(report.totalDeleted).toBe(10);
        expect(report.results.map((result) => result.tenantId)).toEqual(['main', 't1', 't2']);
        expect(main.tenant.findMany).toHaveBeenCalledExactlyOnceWith({
            where: { status: 'ACTIVE' }, select: { id: true, name: true, dbUrl: true },
        });
        for (const db of [main, first, second]) {
            expect(db.performanceMetric.deleteMany).toHaveBeenCalledExactlyOnceWith({
                where: { createdAt: { lt: new Date(NOW.getTime() - 30 * 86_400_000) } },
            });
            expect(db.$disconnect).toHaveBeenCalledOnce();
        }
        expect(dependencies.logger.log.mock.calls).toEqual([
            ['  -> [main] OK: deleted 5 PerformanceMetric row(s).'],
            ['  -> [tenant #1] OK: deleted 2 PerformanceMetric row(s).'],
            ['  -> [tenant #2] OK: deleted 3 PerformanceMetric row(s).'],
            ['[PerformanceMetricCleanup] Done. Total deleted: 10. Status: OK.'],
        ]);
        expect(dependencies.logger.error).not.toHaveBeenCalled();
        expect(dependencies.setExitCode).not.toHaveBeenCalled();
        expect(prismaConstructor).not.toHaveBeenCalled();
        expect(main.$disconnect.mock.invocationCallOrder[0])
            .toBeLessThan(dependencies.logger.log.mock.invocationCallOrder[0]);
    });

    it('honors custom retention and succeeds with no tenants after releasing main', async () => {
        const { main, dependencies } = fixture();
        main.tenant.findMany.mockResolvedValueOnce([]);
        const report = await runPerformanceMetricCleanupCli(dependencies, 7);
        expect(main.performanceMetric.deleteMany).toHaveBeenCalledWith({
            where: { createdAt: { lt: new Date(NOW.getTime() - 7 * 86_400_000) } },
        });
        expect(report.results).toHaveLength(1);
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expect(dependencies.createTenantClient).not.toHaveBeenCalled();
        expect(dependencies.setExitCode).not.toHaveBeenCalled();
    });

    it.each([0, -1, NaN, Infinity, Number.MAX_VALUE])('rejects retention %s before constructing any client', async (days) => {
        const { dependencies } = fixture();
        const report = await runPerformanceMetricCleanupCli(dependencies, days);
        expect(report.errors).toEqual(['Invalid retention period']);
        expect(dependencies.createMainClient).not.toHaveBeenCalled();
        expect(dependencies.createTenantClient).not.toHaveBeenCalled();
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(dependencies.logger.error).toHaveBeenCalledWith('[PerformanceMetricCleanup] Invalid retention period.');
        expect(dependencies.logger.log).toHaveBeenLastCalledWith('[PerformanceMetricCleanup] Done. Total deleted: 0. Status: FAILED.');
    });

    it.each(['factory', 'delete', 'registry', 'disconnect'])('sets nonzero on main %s failure and disconnects every returned client', async (kind) => {
        const { main, dependencies } = fixture();
        if (kind === 'factory') dependencies.createMainClient.mockImplementationOnce(() => { throw rawError; });
        if (kind === 'delete') main.performanceMetric.deleteMany.mockRejectedValueOnce(rawError);
        if (kind === 'registry') main.tenant.findMany.mockRejectedValueOnce(rawError);
        if (kind === 'disconnect') main.$disconnect.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanupCli(dependencies);
        expect(report.hasFailure).toBe(true);
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(main.$disconnect).toHaveBeenCalledTimes(kind === 'factory' ? 0 : 1);
        expect(dependencies.createTenantClient).toHaveBeenCalledTimes(kind === 'disconnect' ? 2 : 0);
        expect(report.totalDeleted).toBe(kind === 'registry' ? 5 : kind === 'disconnect' ? 10 : 0);
        expect(output(dependencies)).not.toContain(rawError.message);
        expect(output(dependencies)).not.toContain('postgres://');
        expect(output(dependencies)).toContain('Status: FAILED');
    });

    it.each([null, '', '  ', 'not-a-url', 'https://a'])('rejects invalid tenant URL %s and continues without fallback', async (dbUrl) => {
        const { main, first, dependencies } = fixture();
        main.tenant.findMany.mockResolvedValueOnce([
            { id: 'bad', name: 'Invalid target', dbUrl },
            { id: 'good', name: 'Valid target', dbUrl: 'postgres://valid/metrics' },
        ]);
        const report = await runPerformanceMetricCleanupCli(dependencies);
        expect(dependencies.createTenantClient).toHaveBeenCalledExactlyOnceWith('postgres://valid/metrics');
        expect(report.results[1]).toMatchObject({ online: false, deletedCount: 0 });
        expect(report.results[2]).toMatchObject({ online: true, deletedCount: 2 });
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expect(first.$disconnect).toHaveBeenCalledOnce();
    });

    it.each(['factory', 'delete', 'disconnect', 'delete+disconnect'])('continues and exits nonzero on tenant %s failure', async (kind) => {
        const { main, first, second, dependencies } = fixture();
        if (kind === 'factory') dependencies.createTenantClient.mockReset()
            .mockImplementationOnce(() => { throw rawError; }).mockReturnValueOnce(second);
        if (kind.includes('delete')) first.performanceMetric.deleteMany.mockRejectedValueOnce(rawError);
        if (kind.includes('disconnect')) first.$disconnect.mockRejectedValueOnce(rawError);
        const report = await runPerformanceMetricCleanupCli(dependencies);
        expect(report.results[1].online).toBe(false);
        expect(report.results[2]).toMatchObject({ online: true, deletedCount: 3 });
        expect(report.totalDeleted).toBe(kind === 'disconnect' ? 10 : 8);
        expect(dependencies.createTenantClient).toHaveBeenCalledTimes(2);
        expect(first.$disconnect).toHaveBeenCalledTimes(kind === 'factory' ? 0 : 1);
        expect(second.$disconnect).toHaveBeenCalledOnce();
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expect(dependencies.setExitCode).toHaveBeenCalledExactlyOnceWith(1);
        expect(output(dependencies)).not.toContain(rawError.message);
        expect(output(dependencies)).toContain('[tenant #1] FAILED');
        expect(output(dependencies)).toContain('[tenant #2] OK');
    });

    it('does not log untrusted tenant names, IDs, URLs, or thrown objects', async () => {
        const { main, first, dependencies } = fixture();
        main.tenant.findMany.mockResolvedValueOnce([
            { id: 'untrusted-id', name: 'untrusted-name\nforged-log', dbUrl: 'postgres://sensitive-url/metrics' },
        ]);
        first.performanceMetric.deleteMany.mockRejectedValueOnce({ message: 'untrusted-exception' });
        await runPerformanceMetricCleanupCli(dependencies);
        for (const secret of ['untrusted-id', 'untrusted-name', 'forged-log', 'sensitive-url', 'untrusted-exception']) {
            expect(output(dependencies)).not.toContain(secret);
        }
        expect(output(dependencies)).toContain('Performance metric deletion failed');
    });
});

// Exercise the actual CommonJS entry guard in memory, never write or run an ops
// script on disk. Both Prisma construction and all database methods are fakes.
const cliSource = readFileSync(resolve('scripts/cleanup-performance-metrics.ts'), 'utf8');
const compiledCli = ts.transpileModule(cliSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function entrypointFixture(isMain: boolean, failFactory = false, withTenants = false) {
    const { main, first, second } = fixture();
    if (!withTenants) main.tenant.findMany.mockResolvedValueOnce([]);
    const clients = [main, first, second];
    const constructor = vi.fn(function () {
        if (failFactory) throw rawError;
        return clients.shift();
    });
    const logger = { log: vi.fn(), error: vi.fn() };
    const processStub: { exitCode?: number } = {};
    const moduleStub = { exports: {} };
    const requireStub = Object.assign((name: string) => {
        if (name === '@prisma/client') return { PrismaClient: constructor };
        if (name === '../src/lib/ops/performance-metrics-cleanup') return core;
        throw new Error('Unexpected module import in standalone CLI');
    }, { main: isMain ? moduleStub : {} });
    runInNewContext(compiledCli, {
        module: moduleStub, exports: moduleStub.exports, require: requireStub,
        console: logger, process: processStub,
    });
    return { main, first, second, constructor, logger, processStub };
}

describe('standalone CommonJS entry guard (in-memory, mock-only)', () => {
    it('does nothing when required as a module', () => {
        const { constructor, logger, processStub } = entrypointFixture(false);
        expect(constructor).not.toHaveBeenCalled();
        expect(logger.log).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
        expect(processStub.exitCode).toBeUndefined();
    });

    it('runs the real adapter/core only as main and releases the fake main client', async () => {
        const { main, constructor, logger, processStub } = entrypointFixture(true);
        await vi.waitFor(() => expect(logger.log).toHaveBeenLastCalledWith(
            '[PerformanceMetricCleanup] Done. Total deleted: 5. Status: OK.',
        ));
        expect(constructor).toHaveBeenCalledOnce();
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expect(processStub.exitCode).toBeUndefined();
    });

    it('constructs tenant clients with explicit URLs and disconnects all of them', async () => {
        const { main, first, second, constructor, logger, processStub } = entrypointFixture(true, false, true);
        await vi.waitFor(() => expect(logger.log).toHaveBeenLastCalledWith(
            '[PerformanceMetricCleanup] Done. Total deleted: 10. Status: OK.',
        ));
        expect(constructor.mock.calls).toEqual([
            [],
            [{ datasources: { db: { url: 'postgres://a/metrics' } } }],
            [{ datasources: { db: { url: 'postgres://b/metrics' } } }],
        ]);
        for (const db of [main, first, second]) expect(db.$disconnect).toHaveBeenCalledOnce();
        expect(processStub.exitCode).toBeUndefined();
    });

    it('turns a real adapter failure into process.exitCode = 1 without raw errors', async () => {
        const { logger, processStub } = entrypointFixture(true, true);
        await vi.waitFor(() => expect(processStub.exitCode).toBe(1));
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain(rawError.message);
        expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Database client creation failed'));
    });

    it('sanitizes an unexpected reporting rejection after resource release', async () => {
        const { main, logger, processStub } = entrypointFixture(true);
        logger.log.mockImplementation(() => { throw rawError; });
        await vi.waitFor(() => expect(processStub.exitCode).toBe(1));
        expect(main.$disconnect).toHaveBeenCalledOnce();
        expect(logger.error).toHaveBeenCalledExactlyOnceWith('[PerformanceMetricCleanup] Unexpected cleanup failure.');
    });
});
