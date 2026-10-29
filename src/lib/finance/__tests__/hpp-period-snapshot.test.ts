import { describe, expect, it } from 'vitest';
import {
    buildHppPeriodSnapshot,
    compareHppPeriodSnapshot,
    enrichHppProductionCosts,
    parseHppPeriodSnapshot,
    resolveHppPeriodBounds,
} from '../hpp-period-snapshot';
import type { ProductionCost } from '@/services/accounting/costing-service';

const makeCost = (overrides: Partial<ProductionCost> = {}): ProductionCost => ({
    productionOrderId: 'po-1',
    orderNumber: 'WO-001',
    status: 'COMPLETED',
    materialCost: 100_000,
    machineCost: 20_000,
    laborCost: 30_000,
    overheadCost: 0,
    totalCost: 150_000,
    quantityProduced: 50,
    unitCost: 3_000,
    ...overrides,
});

describe('hpp-period-snapshot', () => {
    it('resolves WIB month bounds consistently even at UTC/WIB day boundaries', () => {
        // 2026-09-30T17:00:00.000Z is 2026-10-01 00:00:00 WIB
        const bounds = resolveHppPeriodBounds(
            new Date('2026-09-30T17:00:00.000Z'),
        );

        expect(bounds.year).toBe(2026);
        expect(bounds.month).toBe(10);
        expect(bounds.start.toISOString()).toBe('2026-09-30T17:00:00.000Z');
        expect(bounds.end.toISOString()).toBe('2026-10-31T16:59:59.999Z');
    });

    it('builds and parses a version 1 snapshot from production costs', () => {
        const costs = [
            makeCost({
                productionOrderId: 'po-2',
                orderNumber: 'WO-002',
                totalCost: 250_000,
                quantityProduced: 25,
            }),
            makeCost({
                productionOrderId: 'po-1',
                orderNumber: 'WO-001',
                totalCost: 150_000,
                quantityProduced: 50,
            }),
        ];

        const snapshot = buildHppPeriodSnapshot(
            costs,
            new Date('2026-10-29T12:00:00.000Z'),
        );

        expect(snapshot).toEqual({
            version: 1,
            computedAt: '2026-10-29T12:00:00.000Z',
            totalCogm: 400_000,
            totalQuantity: 75,
            orderCount: 2,
            orders: [
                {
                    productionOrderId: 'po-1',
                    orderNumber: 'WO-001',
                    totalCost: 150_000,
                },
                {
                    productionOrderId: 'po-2',
                    orderNumber: 'WO-002',
                    totalCost: 250_000,
                },
            ],
        });

        expect(parseHppPeriodSnapshot(snapshot)).toEqual(snapshot);
        expect(parseHppPeriodSnapshot(null)).toBeNull();
        expect(parseHppPeriodSnapshot({ version: 2 })).toBeNull();
    });

    it('reports MISSING_SNAPSHOT when snapshot is null', () => {
        const comparison = compareHppPeriodSnapshot(null, [makeCost()]);

        expect(comparison.status).toBe('MISSING_SNAPSHOT');
        expect(comparison.changed).toBe(false);
        expect(comparison.orderChanges).toEqual([]);
    });

    it('ignores sub-rupiah rounding differences up to Rp1 when SPK list is identical', () => {
        const snapshot = buildHppPeriodSnapshot(
            [makeCost({ totalCost: 150_000 })],
            '2026-10-29T12:00:00.000Z',
        );

        const unchanged = compareHppPeriodSnapshot(snapshot, [
            makeCost({ totalCost: 150_000.75 }),
        ]);

        expect(unchanged.status).toBe('UNCHANGED');
        expect(unchanged.changed).toBe(false);
        expect(unchanged.orderChanges).toEqual([]);
    });

    it('detects nominal cost shift > Rp1, added SPKs, and removed SPKs', () => {
        const snapshot = buildHppPeriodSnapshot(
            [
                makeCost({
                    productionOrderId: 'po-1',
                    orderNumber: 'WO-001',
                    totalCost: 150_000,
                    quantityProduced: 50,
                }),
                makeCost({
                    productionOrderId: 'po-2',
                    orderNumber: 'WO-002',
                    totalCost: 200_000,
                    quantityProduced: 40,
                }),
            ],
            '2026-10-29T12:00:00.000Z',
        );

        const live = [
            makeCost({
                productionOrderId: 'po-1',
                orderNumber: 'WO-001',
                totalCost: 175_000,
                quantityProduced: 50,
            }),
            makeCost({
                productionOrderId: 'po-3',
                orderNumber: 'WO-003',
                totalCost: 90_000,
                quantityProduced: 30,
            }),
        ];

        const diff = compareHppPeriodSnapshot(snapshot, live);

        expect(diff.status).toBe('CHANGED');
        expect(diff.changed).toBe(true);
        expect(diff.lockedTotalCogm).toBe(350_000);
        expect(diff.currentTotalCogm).toBe(265_000);
        expect(diff.deltaCogm).toBe(-85_000);
        expect(diff.orderChanges).toEqual([
            {
                productionOrderId: 'po-1',
                orderNumber: 'WO-001',
                kind: 'CHANGED',
                lockedCost: 150_000,
                currentCost: 175_000,
                deltaCost: 25_000,
            },
            {
                productionOrderId: 'po-2',
                orderNumber: 'WO-002',
                kind: 'REMOVED',
                lockedCost: 200_000,
                currentCost: null,
                deltaCost: -200_000,
            },
            {
                productionOrderId: 'po-3',
                orderNumber: 'WO-003',
                kind: 'ADDED',
                lockedCost: null,
                currentCost: 90_000,
                deltaCost: 90_000,
            },
        ]);
    });

    it('enriches production costs with BOM metadata and skips orders without BOM', () => {
        const costs = [
            makeCost({ productionOrderId: 'po-1', orderNumber: 'WO-001' }),
            makeCost({ productionOrderId: 'po-no-bom', orderNumber: 'WO-002' }),
        ];

        const enriched = enrichHppProductionCosts(costs, [
            {
                id: 'po-1',
                bom: {
                    id: 'bom-1',
                    name: 'BOM Plastik',
                    category: 'PACKAGING',
                    productVariant: {
                        name: 'Roll 50cm',
                        skuCode: 'SKU-50',
                        standardCost: 2_800,
                        product: { name: 'Plastik Roll' },
                    },
                },
            },
        ]);

        expect(enriched).toHaveLength(1);
        expect(enriched[0]).toMatchObject({
            productionOrderId: 'po-1',
            bomId: 'bom-1',
            bomName: 'BOM Plastik',
            productName: 'Plastik Roll',
            productSku: 'SKU-50',
            category: 'PACKAGING',
            standardCost: 2_800,
        });
    });
});
