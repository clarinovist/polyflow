import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { closeOpenShellsForOrder, AUTO_CLOSE_NOTE } from '../order-shell-closure';
import { buildPieceSnapshotForOperator } from '@/services/hrd/piece-rate-helpers';
import { SHELL_CLOSE_SETTING_KEY } from '@/services/settings/shell-close-setting-service';

vi.mock('@/services/hrd/piece-rate-helpers', () => ({
    buildPieceSnapshotForOperator: vi.fn(async () => ({ pieceRateSnapshot: null, pieceEarnings: null, pieceMachineType: null })),
}));

const start = new Date('2026-10-06T08:46:00Z');
const lastOutput = new Date('2026-10-20T02:08:00Z');
const shell = (overrides: Record<string, unknown> = {}) => ({
    id: 'shell-1', productionOrderId: 'po-1', machineId: 'machine-1', operatorId: 'op-1',
    startTime: start, endTime: null, status: 'COMPLETED', quantityProduced: { toString: () => '0' }, notes: null,
    ...overrides,
});
const receipt = (executionIds: string[]) => ({
    action: 'START_PRODUCTION_COST_PERIOD', entityType: 'ProductionOrder', entityId: 'po-1',
    changes: { version: 1, orderId: 'po-1', movementIds: ['m'], executionIds, sourceHash: 'a'.repeat(64),
        executionHash: 'b'.repeat(64), fingerprint: 'c'.repeat(64), historicalBalances: [] },
});

// Loosely typed so each test can return partial rows and read call arguments.
type MockFn = Mock<(...args: any[]) => Promise<any>>;
const mockFn = (value: unknown): MockFn => vi.fn(async () => value);

function fakeTx() {
    return {
        $queryRaw: mockFn([]),
        auditLog: { findUnique: mockFn(null) },
        appSetting: { findUnique: mockFn({ value: 'true' }) },
        productionExecution: {
            findMany: mockFn([shell()]),
            aggregate: mockFn({ _max: { endTime: lastOutput } }),
            updateMany: mockFn({ count: 1 }),
        },
    };
}

describe('closeOpenShellsForOrder', () => {
    let tx: ReturnType<typeof fakeTx>;
    beforeEach(() => {
        vi.clearAllMocks();
        tx = fakeTx();
    });

    it('locks the order and ends an open shell at its last output on the same machine', async () => {
        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(String(tx.$queryRaw.mock.calls[0][0])).toContain('FOR UPDATE');
        expect(tx.productionExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { productionOrderId: 'po-1', endTime: null, status: { not: 'VOIDED' } },
        }));
        expect(tx.productionExecution.aggregate).toHaveBeenCalledWith({
            _max: { endTime: true },
            where: {
                productionOrderId: 'po-1', id: { not: 'shell-1' }, status: { not: 'VOIDED' },
                machineId: 'machine-1', endTime: { gte: start },
            },
        });
        expect(tx.productionExecution.updateMany).toHaveBeenCalledWith({
            where: { id: 'shell-1', endTime: null, status: { not: 'VOIDED' } },
            data: expect.objectContaining({ endTime: lastOutput, notes: AUTO_CLOSE_NOTE }),
        });
        expect(buildPieceSnapshotForOperator).toHaveBeenCalledWith(tx, { operatorId: 'op-1', machineId: 'machine-1', quantityProduced: 0 });
        expect(tx.appSetting.findUnique).toHaveBeenCalledWith({ where: { key: SHELL_CLOSE_SETTING_KEY }, select: { value: true } });
        expect(result).toEqual({ closed: [{ id: 'shell-1', endTime: lastOutput }], skippedFrozen: [], costPeriodUnreadable: false, atLastOutput: true });
    });

    it('defaults to a zero-length session when the tenant has not chosen last-output closing', async () => {
        tx.appSetting.findUnique.mockResolvedValue(null);

        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(tx.productionExecution.aggregate).not.toHaveBeenCalled();
        expect(result).toMatchObject({ closed: [{ id: 'shell-1', endTime: start }], atLastOutput: false });
    });

    it('lets a caller choose the rule explicitly without reading the tenant setting', async () => {
        const result = await closeOpenShellsForOrder(tx as never, 'po-1', { atLastOutput: false });

        expect(tx.appSetting.findUnique).not.toHaveBeenCalled();
        expect(result.closed).toEqual([{ id: 'shell-1', endTime: start }]);
    });

    it('gives a shell without any output a zero-length session instead of running until now', async () => {
        tx.productionExecution.aggregate.mockResolvedValue({ _max: { endTime: null } });

        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(result.closed).toEqual([{ id: 'shell-1', endTime: start }]);
    });

    it('matches outputs without a machine only to a shell without a machine', async () => {
        tx.productionExecution.findMany.mockResolvedValue([shell({ machineId: null })]);

        await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(tx.productionExecution.aggregate.mock.calls[0][0].where.machineId).toBeNull();
    });

    it('keeps existing notes and never moves the end before the start', async () => {
        tx.productionExecution.findMany.mockResolvedValue([shell({ notes: 'Shift malam' })]);
        tx.productionExecution.aggregate.mockResolvedValue({ _max: { endTime: new Date('2026-10-01T00:00:00Z') } });

        await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(tx.productionExecution.updateMany.mock.calls[0][0].data).toMatchObject({
            endTime: start, notes: `Shift malam ${AUTO_CLOSE_NOTE}`,
        });
    });

    it('does nothing and reads no boundary when no shell is open', async () => {
        tx.productionExecution.findMany.mockResolvedValue([]);

        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(result).toEqual({ closed: [], skippedFrozen: [], costPeriodUnreadable: false, atLastOutput: false });
        expect(tx.auditLog.findUnique).not.toHaveBeenCalled();
        expect(tx.appSetting.findUnique).not.toHaveBeenCalled();
        expect(tx.productionExecution.updateMany).not.toHaveBeenCalled();
    });

    it('never touches a shell frozen by a cost boundary', async () => {
        tx.productionExecution.findMany.mockResolvedValue([shell(), shell({ id: 'shell-2' })]);
        tx.auditLog.findUnique.mockResolvedValue(receipt(['shell-1']));

        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(result.skippedFrozen).toEqual(['shell-1']);
        expect(result.closed.map((c) => c.id)).toEqual(['shell-2']);
        expect(tx.productionExecution.updateMany).toHaveBeenCalledTimes(1);
    });

    it('leaves all shells open, without failing, when the boundary receipt is unreadable', async () => {
        tx.auditLog.findUnique.mockResolvedValue({ ...receipt(['x']), changes: { version: 9 } });

        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(result).toMatchObject({ closed: [], skippedFrozen: [], costPeriodUnreadable: true });
        expect(tx.productionExecution.updateMany).not.toHaveBeenCalled();
    });

    it('propagates unexpected database failures', async () => {
        tx.auditLog.findUnique.mockRejectedValue(new Error('connection lost'));

        await expect(closeOpenShellsForOrder(tx as never, 'po-1')).rejects.toThrow('connection lost');
    });

    it('reports only shells it actually closed when another request closed one first', async () => {
        tx.productionExecution.updateMany.mockResolvedValue({ count: 0 });

        const result = await closeOpenShellsForOrder(tx as never, 'po-1');

        expect(result.closed).toEqual([]);
    });
});
