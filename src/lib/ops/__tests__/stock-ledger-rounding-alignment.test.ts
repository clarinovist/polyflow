import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MovementType, Prisma } from '@prisma/client';
import {
    LEDGER_ROUNDING_ALIGN_ACTION,
    LEDGER_ROUNDING_ALIGN_REFERENCE,
    applyLedgerAlignment,
    parseLedgerAlignmentRequest,
    previewLedgerAlignment,
    saveLedgerAlignmentBackup,
    type LedgerAlignmentRequest,
} from '../stock-ledger-rounding-alignment';
import { parseLedgerAlignmentArgs } from '../../../../scripts/align-stock-ledger-rounding';

const baseRequest: LedgerAlignmentRequest = {
    tenant: 'synthetic',
    database: 'synthetic_test',
    actorId: 'actor-1',
    reason: 'Align historical rounding residuals before opname',
};

interface MockPairState {
    productVariantId: string;
    skuCode: string;
    locationId: string;
    locationName: string;
    live: string;
    ledger: string;
    averageCost: string | null;
}

function defaultPairs(): MockPairState[] {
    return [
        { productVariantId: 'var-out', skuCode: 'SKU-OUT', locationId: 'loc-2', locationName: 'Warehouse B', live: '4.9992', ledger: '5.0000', averageCost: null },
        { productVariantId: 'var-in', skuCode: 'SKU-IN', locationId: 'loc-1', locationName: 'Warehouse A', live: '10.0005', ledger: '10.0000', averageCost: '12500.0000' },
        { productVariantId: 'var-mat', skuCode: 'SKU-MAT', locationId: 'loc-1', locationName: 'Warehouse A', live: '20.0100', ledger: '20.0000', averageCost: '8000.0000' },
        { productVariantId: 'var-clean', skuCode: 'SKU-CLEAN', locationId: 'loc-1', locationName: 'Warehouse A', live: '15.0000', ledger: '15.0000', averageCost: '5000.0000' },
    ];
}

function createStatefulTx(
    initialPairs: MockPairState[] = defaultPairs(),
    options?: { skipLedgerUpdateOnCreate?: boolean },
) {
    const state = initialPairs.map((pair) => ({ ...pair }));
    let movementSeq = 0;

    const queryRows = () =>
        state
            .filter((pair) => !new Prisma.Decimal(pair.live).equals(new Prisma.Decimal(pair.ledger)))
            .map((pair) => {
                const live = new Prisma.Decimal(pair.live);
                const ledger = new Prisma.Decimal(pair.ledger);
                return {
                    productVariantId: pair.productVariantId,
                    skuCode: pair.skuCode,
                    locationId: pair.locationId,
                    locationName: pair.locationName,
                    live: live.toFixed(4),
                    ledger: ledger.toFixed(4),
                    diff: live.minus(ledger).toFixed(4),
                    averageCost: pair.averageCost,
                };
            });

    return {
        state,
        $executeRaw: vi.fn(async () => 0),
        $queryRaw: vi.fn(async (query: unknown) => {
            const sqlText =
                typeof query === 'object' && query !== null && 'strings' in query
                    ? (query as { strings: readonly string[] }).strings.join(' ')
                    : String(query);
            if (sqlText.includes('FOR UPDATE')) {
                return state.map((pair) => ({
                    id: `inv-${pair.productVariantId}-${pair.locationId}`,
                    productVariantId: pair.productVariantId,
                    locationId: pair.locationId,
                    quantity: pair.live,
                    averageCost: pair.averageCost,
                }));
            }
            return queryRows();
        }),
        user: { findUnique: vi.fn(async () => ({ id: 'actor-1' })) },
        stockMovement: {
            create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
                movementSeq += 1;
                if (!options?.skipLedgerUpdateOnCreate) {
                    const qty = new Prisma.Decimal(data.quantity as string | number | Prisma.Decimal);
                    const targetLocationId = (data.toLocationId ?? data.fromLocationId) as string;
                    const pair = state.find(
                        (item) =>
                            item.productVariantId === data.productVariantId &&
                            item.locationId === targetLocationId,
                    );
                    if (pair) {
                        const current = new Prisma.Decimal(pair.ledger);
                        pair.ledger = (data.toLocationId ? current.plus(qty) : current.minus(qty)).toFixed(4);
                    }
                }
                return { id: `mov-${movementSeq}`, ...data };
            }),
        },
        inventory: { update: vi.fn(), updateMany: vi.fn() },
        journalEntry: { create: vi.fn() },
        auditLog: { create: vi.fn(async () => ({ id: 'audit-1' })) },
    };
}

const createFakeDb = (tx: ReturnType<typeof createStatefulTx>) => ({
    $transaction: vi.fn(async (fn: (client: unknown) => unknown, _opts?: unknown) => fn(tx)),
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('parseLedgerAlignmentRequest', () => {
    it('requires fingerprint only when execute is true', () => {
        expect(parseLedgerAlignmentRequest(baseRequest, false)).toEqual(baseRequest);
        expect(() => parseLedgerAlignmentRequest(baseRequest, true)).toThrow('fingerprint');
        const reviewed = { ...baseRequest, fingerprint: 'a'.repeat(64) };
        expect(parseLedgerAlignmentRequest(reviewed, true).fingerprint).toBe('a'.repeat(64));
    });

    it('rejects unknown fields and invalid identifiers or short reason', () => {
        expect(() => parseLedgerAlignmentRequest({ ...baseRequest, extra: true }, false)).toThrow();
        expect(() => parseLedgerAlignmentRequest({ ...baseRequest, tenant: '../bad' }, false)).toThrow();
        expect(() => parseLedgerAlignmentRequest({ ...baseRequest, database: 'bad-db' }, false)).toThrow();
        expect(() => parseLedgerAlignmentRequest({ ...baseRequest, actorId: '' }, false)).toThrow();
        expect(() => parseLedgerAlignmentRequest({ ...baseRequest, reason: 'too short' }, false)).toThrow();
    });
});

describe('previewLedgerAlignment', () => {
    it('runs in a READ ONLY transaction and separates rounding candidates (< 0.01) from material mismatches (>= 0.01)', async () => {
        const tx = createStatefulTx();
        const preview = await previewLedgerAlignment(createFakeDb(tx) as never);

        expect(String(tx.$executeRaw.mock.calls[0])).toContain('READ ONLY');
        expect(preview.candidates).toEqual([
            {
                productVariantId: 'var-in',
                skuCode: 'SKU-IN',
                locationId: 'loc-1',
                locationName: 'Warehouse A',
                live: '10.0005',
                ledger: '10',
                diff: '0.0005',
            },
            {
                productVariantId: 'var-out',
                skuCode: 'SKU-OUT',
                locationId: 'loc-2',
                locationName: 'Warehouse B',
                live: '4.9992',
                ledger: '5',
                diff: '-0.0008',
            },
        ]);
        expect(preview.unhandledMaterial).toEqual([
            {
                productVariantId: 'var-mat',
                skuCode: 'SKU-MAT',
                locationId: 'loc-1',
                locationName: 'Warehouse A',
                live: '20.01',
                ledger: '20',
                diff: '0.01',
            },
        ]);
        expect(preview.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces a canonical fingerprint independent of row order and changes when a candidate diff changes', async () => {
        const previewA = await previewLedgerAlignment(createFakeDb(createStatefulTx(defaultPairs())) as never);
        const previewB = await previewLedgerAlignment(
            createFakeDb(createStatefulTx([...defaultPairs()].reverse())) as never,
        );
        const modified = defaultPairs();
        modified[1] = { ...modified[1], live: '10.0006' };
        const previewC = await previewLedgerAlignment(createFakeDb(createStatefulTx(modified)) as never);

        expect(previewB.fingerprint).toBe(previewA.fingerprint);
        expect(previewC.fingerprint).not.toBe(previewA.fingerprint);
    });
});

describe('applyLedgerAlignment', () => {
    it('locks candidate Inventory rows in a Serializable tx, creates IN/OUT ADJUSTMENT movements without touching Inventory, and writes one AuditLog', async () => {
        const tx = createStatefulTx();
        const db = createFakeDb(tx);
        const preview = await previewLedgerAlignment(db as never);
        const backup = vi.fn(async () => '/app/backups/stock-ledger-alignment/b1.json#sha256=deadbeef');

        const result = await applyLedgerAlignment(
            db as never,
            { ...baseRequest, fingerprint: preview.fingerprint },
            backup,
        );

        expect(db.$transaction).toHaveBeenLastCalledWith(
            expect.any(Function),
            expect.objectContaining({
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            }),
        );
        expect(backup).toHaveBeenCalledOnce();
        expect(tx.inventory.update).not.toHaveBeenCalled();
        expect(tx.inventory.updateMany).not.toHaveBeenCalled();
        expect(tx.journalEntry.create).not.toHaveBeenCalled();

        expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
        expect(tx.stockMovement.create).toHaveBeenNthCalledWith(1, {
            data: {
                type: MovementType.ADJUSTMENT,
                productVariantId: 'var-in',
                fromLocationId: null,
                toLocationId: 'loc-1',
                quantity: new Prisma.Decimal('0.0005'),
                cost: new Prisma.Decimal('12500'),
                reference: LEDGER_ROUNDING_ALIGN_REFERENCE,
                createdById: 'actor-1',
            },
        });
        expect(tx.stockMovement.create).toHaveBeenNthCalledWith(2, {
            data: {
                type: MovementType.ADJUSTMENT,
                productVariantId: 'var-out',
                fromLocationId: 'loc-2',
                toLocationId: null,
                quantity: new Prisma.Decimal('0.0008'),
                cost: null,
                reference: LEDGER_ROUNDING_ALIGN_REFERENCE,
                createdById: 'actor-1',
            },
        });

        expect(tx.auditLog.create).toHaveBeenCalledOnce();
        expect(tx.auditLog.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                userId: 'actor-1',
                action: LEDGER_ROUNDING_ALIGN_ACTION,
                dedupeKey: `${LEDGER_ROUNDING_ALIGN_ACTION}:${preview.fingerprint}`,
                details: baseRequest.reason,
                changes: expect.objectContaining({
                    database: baseRequest.database,
                    fingerprint: preview.fingerprint,
                    backupReference: '/app/backups/stock-ledger-alignment/b1.json#sha256=deadbeef',
                    movementIds: ['mov-1', 'mov-2'],
                }),
            }),
        });
        expect(result).toMatchObject({
            alreadyClean: false,
            fingerprint: preview.fingerprint,
            movementIds: ['mov-1', 'mov-2'],
            backupReference: '/app/backups/stock-ledger-alignment/b1.json#sha256=deadbeef',
            auditId: 'audit-1',
        });
    });

    it('handles clean rerun without writing and rejects stale fingerprint on rerun', async () => {
        const tx = createStatefulTx();
        const db = createFakeDb(tx);
        const initialPreview = await previewLedgerAlignment(db as never);

        await applyLedgerAlignment(
            db as never,
            { ...baseRequest, fingerprint: initialPreview.fingerprint },
            vi.fn(async () => 'backup-ref'),
        );

        const backupOnStale = vi.fn();
        await expect(
            applyLedgerAlignment(
                db as never,
                { ...baseRequest, fingerprint: initialPreview.fingerprint },
                backupOnStale,
            ),
        ).rejects.toThrow(/fingerprint/i);
        expect(backupOnStale).not.toHaveBeenCalled();

        const afterPreview = await previewLedgerAlignment(db as never);
        expect(afterPreview.candidates).toEqual([]);
        expect(afterPreview.unhandledMaterial).toHaveLength(1);

        const backupOnClean = vi.fn();
        const cleanResult = await applyLedgerAlignment(
            db as never,
            { ...baseRequest, fingerprint: afterPreview.fingerprint },
            backupOnClean,
        );
        expect(cleanResult.alreadyClean).toBe(true);
        expect(cleanResult.message).toContain('sudah bersih');
        expect(backupOnClean).not.toHaveBeenCalled();
        expect(tx.stockMovement.create).toHaveBeenCalledTimes(2);
        expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('writes nothing to the database when backup fails', async () => {
        const tx = createStatefulTx();
        const db = createFakeDb(tx);
        const preview = await previewLedgerAlignment(db as never);

        await expect(
            applyLedgerAlignment(
                db as never,
                { ...baseRequest, fingerprint: preview.fingerprint },
                vi.fn(async () => {
                    throw new Error('Disk full on host backup mount');
                }),
            ),
        ).rejects.toThrow('Disk full');

        expect(tx.stockMovement.create).not.toHaveBeenCalled();
        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });

    it('rolls back when postcondition check detects remaining mismatch after movement creation', async () => {
        const tx = createStatefulTx(defaultPairs(), { skipLedgerUpdateOnCreate: true });
        const db = createFakeDb(tx);
        const preview = await previewLedgerAlignment(db as never);

        await expect(
            applyLedgerAlignment(
                db as never,
                { ...baseRequest, fingerprint: preview.fingerprint },
                vi.fn(async () => 'backup-ref'),
            ),
        ).rejects.toThrow(/postcondition|selisih|kartu stok/i);

        expect(tx.auditLog.create).not.toHaveBeenCalled();
    });
});

describe('saveLedgerAlignmentBackup', () => {
    it('writes an exclusive backup file in stock-ledger-alignment and verifies SHA-256 readback', async () => {
        const root = await mkdtemp(join(tmpdir(), 'ledger-align-'));
        try {
            const preview = await previewLedgerAlignment(createFakeDb(createStatefulTx()) as never);
            const ref = await saveLedgerAlignmentBackup(root, 'tenant-1', preview, preview.fingerprint);

            const [filePath, digest] = ref.split('#sha256=');
            expect(filePath).toContain(join(root, 'stock-ledger-alignment'));
            expect(createHash('sha256').update(await readFile(filePath)).digest('hex')).toBe(digest);
            expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({
                version: 1,
                tenantId: 'tenant-1',
                fingerprint: preview.fingerprint,
            });
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});

describe('align-stock-ledger-rounding CLI arguments', () => {
    it('requires one absolute --input path and pairs --execute with --yes', () => {
        expect(parseLedgerAlignmentArgs(['--input=/tmp/review.json'])).toEqual({
            path: '/tmp/review.json',
            execute: false,
        });
        expect(parseLedgerAlignmentArgs(['--input=/tmp/review.json', '--execute', '--yes'])).toEqual({
            path: '/tmp/review.json',
            execute: true,
        });
        expect(() => parseLedgerAlignmentArgs(['--input=/tmp/review.json', '--execute'])).toThrow('--yes');
        expect(() => parseLedgerAlignmentArgs(['--input=relative.json'])).toThrow('Absolute');
        expect(() => parseLedgerAlignmentArgs(['--input=/tmp/review.json', '--unknown'])).toThrow('one --input');
    });
});
