import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MovementType, Prisma, type PrismaClient } from '@prisma/client';
import {
    returnTestClient,
    verifyReturnTestDatabase,
} from '@/services/finance/__tests__/return-credit-postgres-fixture';
import { evaluateFinalizationVariance } from '@/services/inventory/stock-opname-service';
import {
    LEDGER_ROUNDING_ALIGN_ACTION,
    LEDGER_ROUNDING_ALIGN_REFERENCE,
    applyLedgerAlignment,
    previewLedgerAlignment,
    type LedgerAlignmentRequest,
} from '../stock-ledger-rounding-alignment';

const connection = process.env.RETURN_CREDIT_TEST_DATABASE_URL;
const db = connection ? returnTestClient(connection) : null;

const request: LedgerAlignmentRequest = {
    tenant: 'synthetic',
    database: 'polyflow_return_credit_scope_test',
    actorId: 'align-actor',
    reason: 'Synthetic stock ledger rounding alignment',
};

async function ledgerQuantity(
    client: PrismaClient,
    locationId: string,
    productVariantId: string,
): Promise<Prisma.Decimal> {
    const [inbound, outbound] = await Promise.all([
        client.stockMovement.aggregate({
            where: { toLocationId: locationId, productVariantId },
            _sum: { quantity: true },
        }),
        client.stockMovement.aggregate({
            where: { fromLocationId: locationId, productVariantId },
            _sum: { quantity: true },
        }),
    ]);
    return (inbound._sum.quantity ?? new Prisma.Decimal(0)).minus(
        outbound._sum.quantity ?? new Prisma.Decimal(0),
    );
}

async function seed(client: PrismaClient) {
    await verifyReturnTestDatabase(client);
    await client.$executeRaw`TRUNCATE "Product", "Location", "User", "AuditLog" CASCADE`;
    await client.user.create({
        data: {
            id: 'align-actor',
            email: 'align@example.invalid',
            password: 'synthetic-only',
            role: 'ADMIN',
        },
    });
    await client.location.createMany({
        data: [
            { id: 'loc-a', name: 'Synthetic Warehouse A', slug: 'synthetic-wh-a' },
            { id: 'loc-b', name: 'Synthetic Warehouse B', slug: 'synthetic-wh-b' },
        ],
    });
    await client.product.create({
        data: {
            id: 'prod-1',
            name: 'Synthetic Film',
            productType: 'RAW_MATERIAL',
        },
    });
    await client.productVariant.createMany({
        data: [
            { id: 'var-res-in', productId: 'prod-1', name: 'Residual In Variant', skuCode: 'RES-IN', primaryUnit: 'KG' },
            { id: 'var-res-out', productId: 'prod-1', name: 'Residual Out Variant', skuCode: 'RES-OUT', primaryUnit: 'KG' },
            { id: 'var-material', productId: 'prod-1', name: 'Material Diff Variant', skuCode: 'MAT-DIFF', primaryUnit: 'KG' },
            { id: 'var-clean', productId: 'prod-1', name: 'Clean Variant', skuCode: 'CLEAN-OK', primaryUnit: 'KG' },
        ],
    });
    await client.inventory.createMany({
        data: [
            { locationId: 'loc-a', productVariantId: 'var-res-in', quantity: '10.0005', averageCost: '12500.0000' },
            { locationId: 'loc-b', productVariantId: 'var-res-out', quantity: '4.9992', averageCost: null },
            { locationId: 'loc-a', productVariantId: 'var-material', quantity: '20.0500', averageCost: '9000.0000' },
            { locationId: 'loc-a', productVariantId: 'var-clean', quantity: '15.0000', averageCost: '7500.0000' },
        ],
    });
    await client.stockMovement.createMany({
        data: [
            {
                id: 'seed-mov-in',
                type: MovementType.PURCHASE,
                productVariantId: 'var-res-in',
                toLocationId: 'loc-a',
                quantity: '10.0000',
                cost: '12500.0000',
                reference: 'SEED-OPENING',
                createdById: 'align-actor',
            },
            {
                id: 'seed-mov-out',
                type: MovementType.PURCHASE,
                productVariantId: 'var-res-out',
                toLocationId: 'loc-b',
                quantity: '5.0000',
                cost: null,
                reference: 'SEED-OPENING',
                createdById: 'align-actor',
            },
            {
                id: 'seed-mov-mat',
                type: MovementType.PURCHASE,
                productVariantId: 'var-material',
                toLocationId: 'loc-a',
                quantity: '20.0000',
                cost: '9000.0000',
                reference: 'SEED-OPENING',
                createdById: 'align-actor',
            },
            {
                id: 'seed-mov-clean',
                type: MovementType.PURCHASE,
                productVariantId: 'var-clean',
                toLocationId: 'loc-a',
                quantity: '15.0000',
                cost: '7500.0000',
                reference: 'SEED-OPENING',
                createdById: 'align-actor',
            },
        ],
    });
}

describe.skipIf(!db)('stock ledger rounding alignment PostgreSQL contracts', () => {
    beforeEach(async () => {
        await seed(db!);
    });
    afterAll(async () => {
        await db?.$disconnect();
    });

    it('aligns only rounding residuals (< 0.01), preserves Inventory and material mismatches, writes one audit row, and stays clean on rerun', async () => {
        const preview = await previewLedgerAlignment(db!);

        expect(preview.candidates).toEqual([
            {
                productVariantId: 'var-res-in',
                skuCode: 'RES-IN',
                locationId: 'loc-a',
                locationName: 'Synthetic Warehouse A',
                live: '10.0005',
                ledger: '10',
                diff: '0.0005',
            },
            {
                productVariantId: 'var-res-out',
                skuCode: 'RES-OUT',
                locationId: 'loc-b',
                locationName: 'Synthetic Warehouse B',
                live: '4.9992',
                ledger: '5',
                diff: '-0.0008',
            },
        ]);
        expect(preview.unhandledMaterial).toEqual([
            {
                productVariantId: 'var-material',
                skuCode: 'MAT-DIFF',
                locationId: 'loc-a',
                locationName: 'Synthetic Warehouse A',
                live: '20.05',
                ledger: '20',
                diff: '0.05',
            },
        ]);

        const applied = await applyLedgerAlignment(
            db!,
            { ...request, fingerprint: preview.fingerprint },
            async () => 'synthetic-backup-ref',
        );

        expect(applied.alreadyClean).toBe(false);
        expect(applied.movementIds).toHaveLength(2);
        expect(await db!.journalEntry.count()).toBe(0);

        const inventories = await db!.inventory.findMany({
            orderBy: { productVariantId: 'asc' },
        });
        expect(
            inventories.map((inv) => [
                inv.productVariantId,
                inv.locationId,
                inv.quantity.toFixed(4),
                inv.averageCost?.toFixed(4) ?? null,
            ]),
        ).toEqual([
            ['var-clean', 'loc-a', '15.0000', '7500.0000'],
            ['var-material', 'loc-a', '20.0500', '9000.0000'],
            ['var-res-in', 'loc-a', '10.0005', '12500.0000'],
            ['var-res-out', 'loc-b', '4.9992', null],
        ]);

        const alignMovements = await db!.stockMovement.findMany({
            where: { reference: LEDGER_ROUNDING_ALIGN_REFERENCE },
            orderBy: { productVariantId: 'asc' },
        });
        expect(
            alignMovements.map((mov) => ({
                type: mov.type,
                productVariantId: mov.productVariantId,
                fromLocationId: mov.fromLocationId,
                toLocationId: mov.toLocationId,
                quantity: mov.quantity.toFixed(4),
                cost: mov.cost?.toFixed(4) ?? null,
            })),
        ).toEqual([
            {
                type: MovementType.ADJUSTMENT,
                productVariantId: 'var-res-in',
                fromLocationId: null,
                toLocationId: 'loc-a',
                quantity: '0.0005',
                cost: '12500.0000',
            },
            {
                type: MovementType.ADJUSTMENT,
                productVariantId: 'var-res-out',
                fromLocationId: 'loc-b',
                toLocationId: null,
                quantity: '0.0008',
                cost: null,
            },
        ]);

        const [ledgerIn, ledgerOut, ledgerMat, ledgerClean] = await Promise.all([
            ledgerQuantity(db!, 'loc-a', 'var-res-in'),
            ledgerQuantity(db!, 'loc-b', 'var-res-out'),
            ledgerQuantity(db!, 'loc-a', 'var-material'),
            ledgerQuantity(db!, 'loc-a', 'var-clean'),
        ]);
        expect(ledgerIn.toFixed(4)).toBe('10.0005');
        expect(ledgerOut.toFixed(4)).toBe('4.9992');
        expect(ledgerMat.toFixed(4)).toBe('20.0000');
        expect(ledgerClean.toFixed(4)).toBe('15.0000');

        expect(
            evaluateFinalizationVariance({
                countedQuantity: new Prisma.Decimal('10.0005'),
                cutoffQuantity: ledgerIn,
                liveQuantity: new Prisma.Decimal('10.0005'),
                ledgerQuantity: ledgerIn,
            }).ledgerMismatch,
        ).toBe(false);

        expect(
            await db!.auditLog.count({
                where: {
                    action: LEDGER_ROUNDING_ALIGN_ACTION,
                    dedupeKey: `${LEDGER_ROUNDING_ALIGN_ACTION}:${preview.fingerprint}`,
                },
            }),
        ).toBe(1);

        // Stale fingerprint must be rejected.
        await expect(
            applyLedgerAlignment(
                db!,
                { ...request, fingerprint: preview.fingerprint },
                async () => 'stale-backup',
            ),
        ).rejects.toThrow(/fingerprint/i);

        // Post-apply preview has no residual candidates left, while material mismatch remains.
        const postPreview = await previewLedgerAlignment(db!);
        expect(postPreview.candidates).toEqual([]);
        expect(postPreview.unhandledMaterial).toHaveLength(1);

        const cleanRerun = await applyLedgerAlignment(
            db!,
            { ...request, fingerprint: postPreview.fingerprint },
            async () => 'unused-backup',
        );
        expect(cleanRerun.alreadyClean).toBe(true);
        expect(await db!.auditLog.count({ where: { action: LEDGER_ROUNDING_ALIGN_ACTION } })).toBe(1);
    });
});
