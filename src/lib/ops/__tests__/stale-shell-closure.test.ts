import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    closeOpenShellsForOrder,
    frozenExecutionIds,
    resolveShellEndTime,
} from '@/services/production/order-shell-closure';
import {
    applyStaleShellClosure,
    parseStaleShellRequest,
    planStaleShellClosure,
    previewStaleShellClosure,
    saveStaleShellEvidence,
    type StaleShellPlan,
    type StaleShellRequest,
} from '../stale-shell-closure';
import { parseStaleShellArgs } from '../../../../scripts/close-stale-shells';

vi.mock('@/services/production/order-shell-closure', () => ({
    closeOpenShellsForOrder: vi.fn(),
    frozenExecutionIds: vi.fn(),
    resolveShellEndTime: vi.fn(),
}));

const start = new Date('2026-10-06T08:46:00.000Z');
const lastOutput = new Date('2026-10-06T18:46:00.000Z');
const request: StaleShellRequest = {
    tenant: 'synthetic',
    database: 'synthetic_test',
    actorId: 'system',
    reason: 'Close stale kiosk shells',
    atLastOutput: true,
    zeroHourOrderNumbers: ['WO-ZERO'],
};

const row = (id: string, orderId: string, orderNumber: string) => ({
    id,
    productionOrderId: orderId,
    machineId: 'machine-1',
    startTime: start,
    notes: null,
    pieceRateSnapshot: null,
    pieceEarnings: null,
    pieceMachineType: null,
    productionOrder: { orderNumber },
});

function fakeTx(rows = [row('s1', 'o1', 'WO-LAST'), row('s2', 'o2', 'WO-ZERO')]) {
    return {
        $executeRaw: vi.fn(async () => 0),
        user: { findUnique: vi.fn(async () => ({ id: 'system' })) },
        productionExecution: { findMany: vi.fn(async () => rows) },
        auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
    };
}
const fakeDb = (tx: ReturnType<typeof fakeTx>) => ({
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(frozenExecutionIds).mockResolvedValue(new Set());
    vi.mocked(resolveShellEndTime).mockImplementation(async (_tx, _shell, atLastOutput) =>
        atLastOutput ? lastOutput : start,
    );
});

describe('parseStaleShellRequest', () => {
    it('requires the reviewed fingerprint only to execute', () => {
        expect(parseStaleShellRequest(request, false)).toEqual(request);
        expect(() => parseStaleShellRequest(request, true)).toThrow('fingerprint');
        const reviewed = { ...request, fingerprint: 'a'.repeat(64) };
        expect(parseStaleShellRequest(reviewed, true).fingerprint).toBe('a'.repeat(64));
    });

    it('rejects unknown keys and unsafe target names', () => {
        expect(() => parseStaleShellRequest({ ...request, force: true }, false)).toThrow();
        expect(() => parseStaleShellRequest({ ...request, tenant: '../x' }, false)).toThrow();
        expect(() => parseStaleShellRequest({ ...request, reason: 'short' }, false)).toThrow();
    });
});

describe('planStaleShellClosure', () => {
    it('plans each shell with the tenant rule and the zero-hour override', async () => {
        // Act
        const plan = await planStaleShellClosure(fakeTx() as never, request);

        // Assert
        expect(plan.shells.map((shell) => [shell.orderNumber, shell.atLastOutput, shell.plannedEndTime])).toEqual([
            ['WO-LAST', true, lastOutput.toISOString()],
            ['WO-ZERO', false, start.toISOString()],
        ]);
        expect(plan.totals).toEqual({ orders: 2, shells: 2, withHours: 1, hours: 10 });
        expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('keeps the fingerprint stable for the same state and changes it when an end moves', async () => {
        const first = await planStaleShellClosure(fakeTx() as never, request);
        const again = await planStaleShellClosure(fakeTx() as never, request);
        vi.mocked(resolveShellEndTime).mockResolvedValue(new Date('2026-10-07T00:00:00.000Z'));
        const moved = await planStaleShellClosure(fakeTx() as never, request);

        expect(again.fingerprint).toBe(first.fingerprint);
        expect(moved.fingerprint).not.toBe(first.fingerprint);
    });

    it('fails closed on a zero-hour SPK without a stale shell and on a missing actor', async () => {
        await expect(
            planStaleShellClosure(fakeTx() as never, { ...request, zeroHourOrderNumbers: ['WO-TYPO'] }),
        ).rejects.toThrow('WO-TYPO');
        const tx = fakeTx();
        tx.user.findUnique.mockResolvedValue(null as never);
        await expect(planStaleShellClosure(tx as never, request)).rejects.toThrow('Actor');
    });

    it('separates frozen shells and orders with an unreadable cost period', async () => {
        vi.mocked(frozenExecutionIds).mockImplementation(async (_tx, orderId) =>
            orderId === 'o1' ? new Set(['s1']) : null,
        );

        const plan = await planStaleShellClosure(fakeTx() as never, request);

        expect(plan.shells).toEqual([]);
        expect(plan.frozenShellIds).toEqual(['s1']);
        expect(plan.unreadableOrderNumbers).toEqual(['WO-ZERO']);
    });
});

describe('previewStaleShellClosure', () => {
    it('plans inside a read-only transaction', async () => {
        const tx = fakeTx();

        await previewStaleShellClosure(fakeDb(tx) as never, request);

        expect(String(tx.$executeRaw.mock.calls[0])).toContain('READ ONLY');
    });
});

describe('applyStaleShellClosure', () => {
    const closed = (id: string, endTime: Date) => ({
        closed: [{ id, endTime }],
        skippedFrozen: [],
        costPeriodUnreadable: false,
        atLastOutput: false,
    });

    async function reviewed() {
        const plan = await planStaleShellClosure(fakeTx() as never, request);
        return { ...request, fingerprint: plan.fingerprint };
    }

    it('saves evidence, closes per SPK with its rule and writes one deduplicated audit', async () => {
        // Arrange
        const input = await reviewed();
        const tx = fakeTx();
        const save = vi.fn(async (plan: StaleShellPlan) => `evidence#${plan.shells.length}`);
        vi.mocked(closeOpenShellsForOrder).mockImplementation(async (_tx, orderId) =>
            orderId === 'o1' ? closed('s1', lastOutput) : closed('s2', start),
        );

        // Act
        const result = await applyStaleShellClosure(fakeDb(tx) as never, input, save);

        // Assert
        expect(save).toHaveBeenCalledOnce();
        expect(vi.mocked(closeOpenShellsForOrder).mock.calls.map((call) => [call[1], call[2]])).toEqual([
            ['o1', { atLastOutput: true }],
            ['o2', { atLastOutput: false }],
        ]);
        expect(tx.auditLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'CLOSE_STALE_SHELLS',
                userId: 'system',
                dedupeKey: `CLOSE_STALE_SHELLS:${input.fingerprint}`,
            }),
        });
        expect(result).toMatchObject({ backupReference: 'evidence#2', auditId: 'audit-1' });
    });

    it('refuses a changed plan before saving or closing anything', async () => {
        const save = vi.fn();

        await expect(
            applyStaleShellClosure(fakeDb(fakeTx()) as never, { ...request, fingerprint: 'f'.repeat(64) }, save),
        ).rejects.toThrow('dry-run');

        expect(save).not.toHaveBeenCalled();
        expect(closeOpenShellsForOrder).not.toHaveBeenCalled();
    });

    it('refuses frozen shells and an empty plan', async () => {
        vi.mocked(frozenExecutionIds).mockResolvedValue(new Set(['s1']));
        const frozenInput = await reviewed();
        await expect(applyStaleShellClosure(fakeDb(fakeTx()) as never, frozenInput, vi.fn())).rejects.toThrow('Frozen');

        const empty = fakeTx([]);
        const emptyPlan = await planStaleShellClosure(empty as never, { ...request, zeroHourOrderNumbers: [] });
        await expect(
            applyStaleShellClosure(
                fakeDb(empty) as never,
                { ...request, zeroHourOrderNumbers: [], fingerprint: emptyPlan.fingerprint },
                vi.fn(),
            ),
        ).rejects.toThrow('No stale shell');
    });

    it('rolls back when the helper closes something other than the plan', async () => {
        const input = await reviewed();
        const tx = fakeTx();
        vi.mocked(closeOpenShellsForOrder).mockResolvedValue(closed('s1', start));

        await expect(applyStaleShellClosure(fakeDb(tx) as never, input, vi.fn(async () => 'ref'))).rejects.toThrow(
            'differ',
        );
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
});

describe('saveStaleShellEvidence', () => {
    it('creates an exclusive, readback-verified evidence file', async () => {
        const root = await mkdtemp(join(tmpdir(), 'stale-shell-'));
        try {
            const plan = await planStaleShellClosure(fakeTx() as never, request);

            const ref = await saveStaleShellEvidence(root, 'tenant', plan);

            const [path, digest] = ref.split('#sha256=');
            expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(digest);
            expect(JSON.parse(await readFile(path, 'utf8')).plan.shells[0].previous).toEqual({
                notes: null,
                pieceRateSnapshot: null,
                pieceEarnings: null,
                pieceMachineType: null,
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe('close-stale-shells CLI arguments', () => {
    it('needs one absolute input and pairs --execute with --yes', () => {
        expect(parseStaleShellArgs(['--input=/tmp/a.json'])).toEqual({ path: '/tmp/a.json', execute: false });
        expect(parseStaleShellArgs(['--input=/tmp/a.json', '--execute', '--yes']).execute).toBe(true);
        expect(() => parseStaleShellArgs(['--input=/tmp/a.json', '--execute'])).toThrow('--yes');
        expect(() => parseStaleShellArgs(['--input=relative.json'])).toThrow('Absolute');
        expect(() => parseStaleShellArgs(['--input=/tmp/a.json', '--force'])).toThrow('one --input');
    });
});
