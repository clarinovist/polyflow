import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completionEndDate } from '@/services/production/order-end-date';
import {
    applyOrderEndDates,
    parseEndDateBackfillRequest,
    planOrderEndDates,
    previewOrderEndDates,
    saveEndDateEvidence,
    type EndDateBackfillRequest,
    type EndDatePlan,
} from '../order-end-date-backfill';
import { parseEndDateBackfillArgs } from '../../../../scripts/backfill-order-end-dates';

vi.mock('@/services/production/order-end-date', () => ({ completionEndDate: vi.fn() }));

const request: EndDateBackfillRequest = {
    tenant: 'synthetic',
    database: 'synthetic_test',
    actorId: 'system',
    reason: 'Fill end dates of old SPKs',
};
// Touched in October, last output in September: the HPP month moves back.
const outputOrder = { id: 'o1', orderNumber: 'WO-OUT', updatedAt: new Date('2026-10-02T03:00:00.000Z') };
const lastOutput = new Date('2026-09-28T05:00:00.000Z');
const noOutputOrder = { id: 'o2', orderNumber: 'WO-NONE', updatedAt: new Date('2026-08-10T03:00:00.000Z') };

function fakeTx(rows = [outputOrder, noOutputOrder]) {
    return {
        $executeRaw: vi.fn(async () => 1),
        user: { findUnique: vi.fn(async () => ({ id: 'system' })) },
        productionOrder: { findMany: vi.fn(async () => rows) },
        auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
    };
}
const fakeDb = (tx: ReturnType<typeof fakeTx>) => ({
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(tx)),
});

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(completionEndDate).mockImplementation(async (_tx, orderId, fallback) =>
        orderId === 'o1' ? lastOutput : (fallback as Date),
    );
});

describe('parseEndDateBackfillRequest', () => {
    it('requires the reviewed fingerprint only to execute and rejects unknown keys', () => {
        expect(parseEndDateBackfillRequest(request, false)).toEqual(request);
        expect(() => parseEndDateBackfillRequest(request, true)).toThrow('fingerprint');
        expect(parseEndDateBackfillRequest({ ...request, fingerprint: 'a'.repeat(64) }, true).fingerprint).toBe('a'.repeat(64));
        expect(() => parseEndDateBackfillRequest({ ...request, overwrite: true }, false)).toThrow();
        expect(() => parseEndDateBackfillRequest({ ...request, database: 'x;drop' }, false)).toThrow();
    });
});

describe('planOrderEndDates', () => {
    it('uses the last output, falls back to updatedAt and reports month moves', async () => {
        // Act
        const plan = await planOrderEndDates(fakeTx() as never, request);

        // Assert
        expect(plan.orders).toEqual([
            { id: 'o1', orderNumber: 'WO-OUT', updatedAt: outputOrder.updatedAt.toISOString(), actualEndDate: lastOutput.toISOString(), source: 'OUTPUT' },
            { id: 'o2', orderNumber: 'WO-NONE', updatedAt: noOutputOrder.updatedAt.toISOString(), actualEndDate: noOutputOrder.updatedAt.toISOString(), source: 'FALLBACK' },
        ]);
        expect(plan.months).toEqual([
            { month: '2026-08', orders: 1, fallback: 1 },
            { month: '2026-09', orders: 1, fallback: 0 },
        ]);
        expect(plan.monthMoves).toEqual([{ orderNumber: 'WO-OUT', from: '2026-10', to: '2026-09' }]);
    });

    it('buckets months in WIB, not UTC', async () => {
        const lateUtc = { id: 'o3', orderNumber: 'WO-EDGE', updatedAt: new Date('2026-09-30T18:00:00.000Z') };

        const plan = await planOrderEndDates(fakeTx([lateUtc]) as never, request);

        expect(plan.months).toEqual([{ month: '2026-10', orders: 1, fallback: 1 }]);
    });

    it('keeps the fingerprint stable and changes it when an end date moves', async () => {
        const first = await planOrderEndDates(fakeTx() as never, request);
        const again = await planOrderEndDates(fakeTx() as never, request);
        vi.mocked(completionEndDate).mockResolvedValue(new Date('2026-09-29T00:00:00.000Z'));
        const moved = await planOrderEndDates(fakeTx() as never, request);

        expect(again.fingerprint).toBe(first.fingerprint);
        expect(moved.fingerprint).not.toBe(first.fingerprint);
    });

    it('refuses a missing actor', async () => {
        const tx = fakeTx();
        tx.user.findUnique.mockResolvedValue(null as never);

        await expect(planOrderEndDates(tx as never, request)).rejects.toThrow('Actor');
    });
});

describe('previewOrderEndDates', () => {
    it('plans inside a read-only transaction', async () => {
        const tx = fakeTx();

        await previewOrderEndDates(fakeDb(tx) as never, request);

        expect(String(tx.$executeRaw.mock.calls[0])).toContain('READ ONLY');
    });
});

describe('applyOrderEndDates', () => {
    async function reviewed(tx = fakeTx()) {
        const plan = await planOrderEndDates(tx as never, request);
        return { ...request, fingerprint: plan.fingerprint };
    }

    it('saves evidence, fills only still-empty rows and writes one deduplicated audit', async () => {
        // Arrange
        const input = await reviewed();
        const tx = fakeTx();
        const save = vi.fn(async (plan: EndDatePlan) => `evidence#${plan.orders.length}`);

        // Act
        const result = await applyOrderEndDates(fakeDb(tx) as never, input, save);

        // Assert
        expect(save).toHaveBeenCalledOnce();
        expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
        expect(String(tx.$executeRaw.mock.calls[0])).toContain('"actualEndDate" IS NULL');
        expect(tx.auditLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                action: 'BACKFILL_ORDER_END_DATES',
                dedupeKey: `BACKFILL_ORDER_END_DATES:${input.fingerprint}`,
            }),
        });
        expect(result).toMatchObject({ orders: 2, fallback: 1, monthMoves: 1, backupReference: 'evidence#2', auditId: 'audit-1' });
    });

    it('refuses a changed plan before saving or writing', async () => {
        const save = vi.fn();
        const tx = fakeTx();

        await expect(
            applyOrderEndDates(fakeDb(tx) as never, { ...request, fingerprint: 'f'.repeat(64) }, save),
        ).rejects.toThrow('dry-run');

        expect(save).not.toHaveBeenCalled();
        expect(tx.$executeRaw).not.toHaveBeenCalled();
    });

    it('refuses an empty plan', async () => {
        const empty = fakeTx([]);
        const input = await reviewed(empty);

        await expect(applyOrderEndDates(fakeDb(empty) as never, input, vi.fn())).rejects.toThrow('missing an end date');
    });

    it('rolls back when a row no longer matches', async () => {
        const input = await reviewed();
        const tx = fakeTx();
        tx.$executeRaw.mockResolvedValueOnce(1 as never).mockResolvedValueOnce(0 as never);

        await expect(applyOrderEndDates(fakeDb(tx) as never, input, vi.fn(async () => 'ref'))).rejects.toThrow('changed during');
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
});

describe('saveEndDateEvidence', () => {
    it('creates an exclusive, readback-verified evidence file', async () => {
        const root = await mkdtemp(join(tmpdir(), 'end-date-'));
        try {
            const plan = await planOrderEndDates(fakeTx() as never, request);

            const ref = await saveEndDateEvidence(root, 'tenant', plan);

            const [path, digest] = ref.split('#sha256=');
            expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(digest);
            expect(JSON.parse(await readFile(path, 'utf8')).plan.orders).toHaveLength(2);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe('backfill-order-end-dates CLI arguments', () => {
    it('needs one absolute input and pairs --execute with --yes', () => {
        expect(parseEndDateBackfillArgs(['--input=/tmp/a.json'])).toEqual({ path: '/tmp/a.json', execute: false });
        expect(parseEndDateBackfillArgs(['--input=/tmp/a.json', '--execute', '--yes']).execute).toBe(true);
        expect(() => parseEndDateBackfillArgs(['--input=/tmp/a.json', '--yes'])).toThrow('--execute');
        expect(() => parseEndDateBackfillArgs(['--input=a.json'])).toThrow('Absolute');
        expect(() => parseEndDateBackfillArgs(['--input=/tmp/a.json', '--all'])).toThrow('one --input');
    });
});
