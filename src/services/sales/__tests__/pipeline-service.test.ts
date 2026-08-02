import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';
import { SalesOrderStatus, SalesLostReason } from '@prisma/client';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findMany: vi.fn(),
        },
    },
}));

import { prisma } from '@/lib/core/prisma';
import { getPipelineData } from '../pipeline-service';
import type { FieldSalesActorScope } from '../field-scope';

const mockFindMany = vi.mocked(prisma.salesOrder.findMany);

const GLOBAL_SCOPE: FieldSalesActorScope = {
    actorUserId: 'admin-1',
    isGlobalViewer: true,
};

const SALES_SCOPE: FieldSalesActorScope = {
    actorUserId: 'sales-1',
    isGlobalViewer: false,
};

function dec(n: number): Decimal {
    return new Decimal(n);
}

function makeRow(overrides: Record<string, unknown> = {}) {
    const now = new Date();
    const created = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
    return {
        id: `so-${Math.random().toString(36).slice(2, 8)}`,
        orderNumber: 'SO-2026-0001',
        status: SalesOrderStatus.QUOTATION,
        totalAmount: dec(1_000_000),
        createdAt: created,
        updatedAt: now,
        customerId: 'cust-1',
        lostReason: null,
        customer: { name: 'Toko A' },
        ...overrides,
    };
}

describe('pipeline-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('happy path tiap stage', () => {
        it('menghitung count, totalValue, avgAgeDays per stage dengan benar', async () => {
            // Arrange
            const rows = [
                makeRow({
                    id: 'so-q',
                    status: SalesOrderStatus.QUOTATION,
                    totalAmount: dec(1_000_000),
                }),
                makeRow({
                    id: 'so-qs',
                    status: SalesOrderStatus.QUOTATION_SENT,
                    totalAmount: dec(2_000_000),
                }),
                makeRow({
                    id: 'so-rej',
                    status: SalesOrderStatus.QUOTATION_REJECTED,
                    totalAmount: dec(500_000),
                    lostReason: SalesLostReason.HARGA_TERLALU_TINGGI,
                }),
                makeRow({
                    id: 'so-exp',
                    status: SalesOrderStatus.QUOTATION_EXPIRED,
                    totalAmount: dec(750_000),
                }),
                makeRow({
                    id: 'so-conv',
                    status: SalesOrderStatus.DRAFT,
                    totalAmount: dec(3_000_000),
                    customerId: 'cust-1',
                }),
                makeRow({
                    id: 'so-conv2',
                    status: SalesOrderStatus.CONFIRMED,
                    totalAmount: dec(4_000_000),
                    customerId: 'cust-2',
                }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.stagesByKey.QUOTATION.count).toBe(1);
            expect(result.stagesByKey.QUOTATION_SENT.count).toBe(1);
            expect(result.stagesByKey.QUOTATION_REJECTED.count).toBe(1);
            expect(result.stagesByKey.QUOTATION_EXPIRED.count).toBe(1);
            expect(result.stagesByKey.CONVERTED.count).toBe(2);

            expect(result.stagesByKey.QUOTATION.totalValue.equals(dec(1_000_000))).toBe(true);
            expect(result.stagesByKey.CONVERTED.totalValue.equals(dec(7_000_000))).toBe(true);

            expect(result.totalCount).toBe(6);
            expect(result.totalValue.equals(dec(11_250_000))).toBe(true);

            // avgAgeDays should be >= 0 (not NaN) for non-empty stages
            expect(result.stagesByKey.QUOTATION.avgAgeDays).toBeGreaterThanOrEqual(0);
            expect(Number.isNaN(result.stagesByKey.QUOTATION.avgAgeDays)).toBe(false);
        });

        it('CONVERTED mencakup DRAFT, CONFIRMED, IN_PRODUCTION, dll', async () => {
            // Arrange
            const rows = [
                makeRow({ status: SalesOrderStatus.DRAFT, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.CONFIRMED, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.IN_PRODUCTION, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.READY_TO_SHIP, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.SHIPPED, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.DELIVERED, customerId: 'c1' }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.stagesByKey.CONVERTED.count).toBe(6);
        });
    });

    describe('conversion rate saat pembagi 0', () => {
        it('return 0 bukan NaN/Infinity ketika tidak ada data', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.conversionRate).toBe(0);
            expect(Number.isNaN(result.conversionRate)).toBe(false);
            expect(Number.isFinite(result.conversionRate)).toBe(true);
            expect(result.totalCount).toBe(0);
            expect(result.totalValue.equals(new Decimal(0))).toBe(true);
        });

        it('return 0 untuk avgAgeDays saat count 0 (jangan NaN)', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            for (const stage of result.stages) {
                expect(stage.avgAgeDays).toBe(0);
                expect(Number.isNaN(stage.avgAgeDays)).toBe(false);
            }
        });
    });

    describe('lostReasonBreakdown termasuk bucket null', () => {
        it('SO REJECTED dengan lostReason null masuk bucket Tidak diketahui (jangan dibuang diam-diam)', async () => {
            // Arrange
            const rows = [
                makeRow({
                    id: 'so-rej-null',
                    status: SalesOrderStatus.QUOTATION_REJECTED,
                    totalAmount: dec(1_000_000),
                    lostReason: null,
                }),
                makeRow({
                    id: 'so-rej-known',
                    status: SalesOrderStatus.QUOTATION_REJECTED,
                    totalAmount: dec(2_000_000),
                    lostReason: SalesLostReason.HARGA_TERLALU_TINGGI,
                }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.lostReasonBreakdown.length).toBe(2);

            const nullBucket = result.lostReasonBreakdown.find((b) => b.reason === null);
            expect(nullBucket).toBeDefined();
            expect(nullBucket!.count).toBe(1);
            expect(nullBucket!.label).toBe('Tidak diketahui');
            expect(nullBucket!.totalValue.equals(dec(1_000_000))).toBe(true);

            const knownBucket = result.lostReasonBreakdown.find(
                (b) => b.reason === SalesLostReason.HARGA_TERLALU_TINGGI,
            );
            expect(knownBucket).toBeDefined();
            expect(knownBucket!.count).toBe(1);
        });

        it('group by lostReason dengan sum totalValue Decimal', async () => {
            // Arrange
            const rows = [
                makeRow({
                    status: SalesOrderStatus.QUOTATION_REJECTED,
                    totalAmount: dec(1_000_000),
                    lostReason: SalesLostReason.HARGA_TERLALU_TINGGI,
                }),
                makeRow({
                    status: SalesOrderStatus.QUOTATION_REJECTED,
                    totalAmount: dec(2_000_000),
                    lostReason: SalesLostReason.HARGA_TERLALU_TINGGI,
                }),
                makeRow({
                    status: SalesOrderStatus.QUOTATION_REJECTED,
                    totalAmount: dec(500_000),
                    lostReason: SalesLostReason.STOK_TIDAK_TERSEDIA,
                }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            const hargaBucket = result.lostReasonBreakdown.find(
                (b) => b.reason === SalesLostReason.HARGA_TERLALU_TINGGI,
            );
            expect(hargaBucket!.count).toBe(2);
            expect(hargaBucket!.totalValue.equals(dec(3_000_000))).toBe(true);

            // sorted by count desc
            expect(result.lostReasonBreakdown[0].reason).toBe(
                SalesLostReason.HARGA_TERLALU_TINGGI,
            );
        });

        it('breakdown kosong saat tidak ada REJECTED', async () => {
            // Arrange
            const rows = [makeRow({ status: SalesOrderStatus.QUOTATION })];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.lostReasonBreakdown).toEqual([]);
        });
    });

    describe('scope non-global viewer narrow ke SO milik sendiri', () => {
        it('global viewer → where tanpa filter assignment', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);

            // Act
            await getPipelineData(GLOBAL_SCOPE);

            // Assert
            const where = mockFindMany.mock.calls[0]![0]!.where as Record<string, unknown>;
            // scopedSalesOrderWhere returns {} for global → no OR
            expect(where.OR).toBeUndefined();
        });

        it('sales biasa → where berisi OR createdById + assignment', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);

            // Act
            await getPipelineData(SALES_SCOPE);

            // Assert
            const where = mockFindMany.mock.calls[0]![0]!.where as Record<string, unknown>;
            expect(where.OR).toBeDefined();
            const or = where.OR as Array<Record<string, unknown>>;
            expect(or.length).toBe(2);
            // First predicate should be createdById = actorUserId
            expect((or[0] as { createdById: string }).createdById).toBe('sales-1');
        });

        it('sales scope tetap menerapkan filter tanggal default bulan berjalan', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);

            // Act
            await getPipelineData(SALES_SCOPE);

            // Assert
            const where = mockFindMany.mock.calls[0]![0]!.where as Record<string, unknown>;
            expect(where.orderDate).toBeDefined();
            const orderDate = where.orderDate as { gte: Date; lte: Date };
            expect(orderDate.gte).toBeInstanceOf(Date);
            expect(orderDate.lte).toBeInstanceOf(Date);
            expect(orderDate.gte.getTime()).toBeLessThanOrEqual(orderDate.lte.getTime());
        });
    });

    describe('exclude legacy internal orders', () => {
        it('SO CONVERTED tanpa customerId (legacy internal) di-exclude', async () => {
            // Arrange
            const rows = [
                makeRow({
                    status: SalesOrderStatus.DRAFT,
                    customerId: null,
                    totalAmount: dec(5_000_000),
                }),
                makeRow({
                    status: SalesOrderStatus.DRAFT,
                    customerId: 'cust-1',
                    totalAmount: dec(1_000_000),
                }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.stagesByKey.CONVERTED.count).toBe(1);
            expect(result.stagesByKey.CONVERTED.totalValue.equals(dec(1_000_000))).toBe(true);
            // grand total only includes counted orders
            expect(result.totalValue.equals(dec(1_000_000))).toBe(true);
        });

        it('SO QUOTATION tanpa customerId tetap dihitung (bukan legacy filter untuk quotation phase)', async () => {
            // Arrange
            const rows = [
                makeRow({
                    status: SalesOrderStatus.QUOTATION,
                    customerId: null,
                }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            // Quotation phase is not excluded even without customerId (they are offers, not legacy stock builds for converted logic)
            // Actually spec says: "Converted — SO yang sudah lewat fase quotation (status BUKAN salah satu dari 4 di atas, dan customerId bukan null — exclude legacy...)"
            // So QUOTATION itself should remain counted
            expect(result.stagesByKey.QUOTATION.count).toBe(1);
        });
    });

    describe('conversion rate calculation', () => {
        it('conversion = converted / (converted+rejected+expired+quotation+quotation_sent)', async () => {
            // Arrange: 2 converted, 1 rejected, 1 expired, 1 quotation, 1 sent = total 6, converted 2 => 2/6 = 0.333...
            const rows = [
                makeRow({ status: SalesOrderStatus.DRAFT, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.CONFIRMED, customerId: 'c1' }),
                makeRow({ status: SalesOrderStatus.QUOTATION_REJECTED }),
                makeRow({ status: SalesOrderStatus.QUOTATION_EXPIRED }),
                makeRow({ status: SalesOrderStatus.QUOTATION }),
                makeRow({ status: SalesOrderStatus.QUOTATION_SENT }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.conversionRate).toBeCloseTo(2 / 6, 5);
        });

        it('conversion 0 ketika tidak ada converted tapi ada rejected', async () => {
            // Arrange
            const rows = [
                makeRow({ status: SalesOrderStatus.QUOTATION_REJECTED }),
                makeRow({ status: SalesOrderStatus.QUOTATION_REJECTED }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.conversionRate).toBe(0);
        });
    });

    describe('date range default', () => {
        it('pakai startOfMonth/endOfMonth saat tidak ada param tanggal', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.startDate).toBeInstanceOf(Date);
            expect(result.endDate).toBeInstanceOf(Date);
            expect(result.startDate.getDate()).toBe(1);
        });

        it('pakai tanggal custom saat diberikan', async () => {
            // Arrange
            mockFindMany.mockResolvedValue([] as never);
            const customStart = new Date('2026-01-01');
            const customEnd = new Date('2026-01-31');

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE, customStart, customEnd);

            // Assert
            expect(result.startDate).toEqual(customStart);
            expect(result.endDate).toEqual(customEnd);

            const where = mockFindMany.mock.calls[0]![0]!.where as Record<string, unknown>;
            const orderDate = where.orderDate as { gte: Date; lte: Date };
            expect(orderDate.gte).toEqual(customStart);
            expect(orderDate.lte).toEqual(customEnd);
        });
    });

    describe('Decimal handling', () => {
        it('totalValue sum pakai Decimal precision, bukan Number langsung', async () => {
            // Arrange: 0.1 + 0.2 should still be precise if using Decimal
            const rows = [
                makeRow({ totalAmount: new Decimal('0.1') }),
                makeRow({ totalAmount: new Decimal('0.2') }),
            ];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.totalValue.equals(new Decimal('0.3'))).toBe(true);
        });

        it('handle totalAmount null → 0', async () => {
            // Arrange
            const rows = [makeRow({ totalAmount: null as unknown as Decimal })];
            mockFindMany.mockResolvedValue(rows as never);

            // Act
            const result = await getPipelineData(GLOBAL_SCOPE);

            // Assert
            expect(result.totalValue.equals(new Decimal(0))).toBe(true);
            expect(result.stagesByKey.QUOTATION.totalValue.equals(new Decimal(0))).toBe(true);
        });
    });
});
