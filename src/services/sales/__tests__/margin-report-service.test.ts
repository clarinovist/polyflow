import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

// ── Mocks ──────────────────────────────────────────────────────────

const mockGetPeriodCosts = vi.fn();
const mockProductionOrderFindMany = vi.fn();
const mockSalesOrderFindMany = vi.fn();

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        productionOrder: {
            findMany: (...args: unknown[]) => mockProductionOrderFindMany(...args),
        },
        salesOrder: {
            findMany: (...args: unknown[]) => mockSalesOrderFindMany(...args),
        },
    },
}));

vi.mock('@/services/accounting/costing-service', () => ({
    CostingService: {
        getPeriodCosts: (...args: unknown[]) => mockGetPeriodCosts(...args),
    },
}));

// ── Module under test (import after mocks) ───────────────────────

import { getVariantHppForPeriod, getMarginReport } from '../margin-report-service';
import { UNATTRIBUTED_SALES_KEY } from '@/lib/sales/revenue-basis';

// ── Helpers ────────────────────────────────────────────────────────

function dec(n: number | string): Decimal {
    return new Decimal(n.toString());
}

function makeProductionOrderMeta(id: string, variantId: string | null) {
    return {
        id,
        bom: variantId ? { productVariantId: variantId } : null,
    };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('margin-report-service — getVariantHppForPeriod', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('weighted average HPP per varian benar saat ada >1 production order untuk varian yang sama', async () => {
        // Arrange: 2 orders same variant, qty beda jauh → weighted, bukan simple avg
        // Order1: totalCost 1_000_000 qty 100 → unit 10_000
        // Order2: totalCost 9_000_000 qty 900 → unit 10_000 juga kalau simple sama
        // Tapi test dengan harga berbeda: order1 unit murah, order2 mahal, bobot qty penting
        // Order1: totalCost 100_000 qty 10  → unit 10_000
        // Order2: totalCost 2_000_000 qty 100 → unit 20_000
        // Weighted: (100_000 + 2_000_000) / (10+100) = 2_100_000/110 = 19_090.909...
        // Simple avg: (10_000+20_000)/2 = 15_000 → harus beda dari weighted
        mockGetPeriodCosts.mockResolvedValue([
            {
                productionOrderId: 'po-1',
                orderNumber: 'PO-001',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 100_000,
                quantityProduced: 10,
                unitCost: 10_000,
            },
            {
                productionOrderId: 'po-2',
                orderNumber: 'PO-002',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 2_000_000,
                quantityProduced: 100,
                unitCost: 20_000,
            },
        ]);

        mockProductionOrderFindMany.mockResolvedValue([
            makeProductionOrderMeta('po-1', 'variant-A'),
            makeProductionOrderMeta('po-2', 'variant-A'),
        ]);

        // Act
        const map = await getVariantHppForPeriod(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        expect(map.size).toBe(1);
        const entry = map.get('variant-A')!;
        expect(entry).toBeDefined();

        const weighted = new Decimal(2_100_000).div(new Decimal(110));
        // Toleransi Decimal floating kecil — compare toNumber within 0.01
        expect(entry.hppPerUnit.toNumber()).toBeCloseTo(weighted.toNumber(), 2);

        // Simple average would be 15_000 — ensure weighted berbeda
        const simpleAvg = 15_000;
        expect(Math.abs(entry.hppPerUnit.toNumber() - simpleAvg)).toBeGreaterThan(1_000);

        // totalQuantity = 110
        expect(entry.totalQuantity.equals(dec(110))).toBe(true);
    });

    it('varian tanpa production order di periode → tidak ada di map → item hppMissing true (via getMarginReport)', async () => {
        // Arrange: periodCosts kosong
        mockGetPeriodCosts.mockResolvedValue([]);
        // Even if productionOrder findMany returns empty, map kosong
        mockProductionOrderFindMany.mockResolvedValue([]);
        mockSalesOrderFindMany.mockResolvedValue([
            {
                id: 'so-1',
                orderNumber: 'SO-001',
                orderDate: new Date('2026-07-10'),
                customerId: 'cust-1',
                salesRepId: null,
                customer: { id: 'cust-1', name: 'Toko A' },
                salesRep: null,
                items: [
                    {
                        id: 'item-1',
                        productVariantId: 'variant-no-prod',
                        quantity: dec(10),
                        subtotal: dec(1_000_000),
                        productVariant: { skuCode: 'SKU-A', product: { name: 'Produk A' } },
                    },
                ],
            },
        ]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert: map kosong
        expect(report.hppMap.size).toBe(0);
        expect(report.variantWithoutHpp).toContain('variant-no-prod');
        expect(report.orders[0].items[0].hppMissing).toBe(true);
        expect(report.orders[0].items[0].hppPerUnit).toBeNull();
        expect(report.orders[0].items[0].cost).toBeNull();
        expect(report.orders[0].items[0].margin).toBeNull();
        expect(report.orders[0].hppCoverage).toBe('NONE');
    });

    it('order tanpa bom atau bom.productVariantId null → SKIP, jangan dihitung', async () => {
        // Arrange
        mockGetPeriodCosts.mockResolvedValue([
            {
                productionOrderId: 'po-bom-null',
                orderNumber: 'PO-BAD',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 500_000,
                quantityProduced: 50,
                unitCost: 10_000,
            },
            {
                productionOrderId: 'po-good',
                orderNumber: 'PO-GOOD',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 1_000_000,
                quantityProduced: 100,
                unitCost: 10_000,
            },
        ]);

        mockProductionOrderFindMany.mockResolvedValue([
            { id: 'po-bom-null', bom: null }, // no bom
            makeProductionOrderMeta('po-good', 'variant-good'),
        ]);

        // Act
        const map = await getVariantHppForPeriod(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert: only variant-good
        expect(map.size).toBe(1);
        expect(map.has('variant-good')).toBe(true);
    });

    it('order dengan quantityProduced 0 di-skip (hindari div by zero)', async () => {
        // Arrange
        mockGetPeriodCosts.mockResolvedValue([
            {
                productionOrderId: 'po-zero-qty',
                orderNumber: 'PO-ZERO',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 100_000,
                quantityProduced: 0,
                unitCost: 0,
            },
        ]);
        mockProductionOrderFindMany.mockResolvedValue([
            makeProductionOrderMeta('po-zero-qty', 'variant-A'),
        ]);

        // Act
        const map = await getVariantHppForPeriod(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert: skipped
        expect(map.size).toBe(0);
    });

    it('group per productVariantId: 2 varian beda terpisah dengan benar', async () => {
        // Arrange
        mockGetPeriodCosts.mockResolvedValue([
            {
                productionOrderId: 'po-a',
                orderNumber: 'PO-A',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 1_000_000,
                quantityProduced: 100,
                unitCost: 10_000,
            },
            {
                productionOrderId: 'po-b',
                orderNumber: 'PO-B',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 2_000_000,
                quantityProduced: 100,
                unitCost: 20_000,
            },
        ]);
        mockProductionOrderFindMany.mockResolvedValue([
            makeProductionOrderMeta('po-a', 'variant-A'),
            makeProductionOrderMeta('po-b', 'variant-B'),
        ]);

        // Act
        const map = await getVariantHppForPeriod(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        expect(map.size).toBe(2);
        expect(map.get('variant-A')!.hppPerUnit.equals(dec(10_000))).toBe(true);
        expect(map.get('variant-B')!.hppPerUnit.equals(dec(20_000))).toBe(true);
    });
});

describe('margin-report-service — getMarginReport coverage & margin logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetPeriodCosts.mockResolvedValue([]);
        mockProductionOrderFindMany.mockResolvedValue([]);
        mockSalesOrderFindMany.mockResolvedValue([]);
    });

    function setupHppMap(variantCostMap: Record<string, { totalCost: number; qty: number }>) {
        const costs = Object.entries(variantCostMap).map(([, v], idx) => ({
            productionOrderId: `po-${idx}`,
            orderNumber: `PO-${idx}`,
            materialCost: 0,
            machineCost: 0,
            laborCost: 0,
            totalCost: v.totalCost,
            quantityProduced: v.qty,
            unitCost: v.totalCost / v.qty,
        }));
        mockGetPeriodCosts.mockResolvedValue(costs);
        mockProductionOrderFindMany.mockResolvedValue(
            Object.keys(variantCostMap).map((variantId, idx) =>
                makeProductionOrderMeta(`po-${idx}`, variantId),
            ),
        );
    }

    function makeSO(overrides: any = {}) {
        return {
            id: `so-${Math.random().toString(36).slice(2, 6)}`,
            orderNumber: 'SO-001',
            orderDate: new Date('2026-07-10'),
            customerId: 'cust-1',
            salesRepId: null,
            customer: { id: 'cust-1', name: 'Toko A' },
            salesRep: null,
            items: [],
            ...overrides,
        };
    }

    function makeItem(
        productVariantId: string,
        qty: number | string,
        subtotal: number | string,
        skuCode = 'SKU-001',
        prodName = 'Produk Test',
    ) {
        return {
            id: `item-${Math.random().toString(36).slice(2, 6)}`,
            productVariantId,
            quantity: dec(qty),
            subtotal: dec(subtotal),
            productVariant: { skuCode, product: { name: prodName } },
        };
    }

    it('margin negatif tampil apa adanya, TIDAK di-clamp ke 0', async () => {
        // Arrange: HPP per unit 20_000, jual 10_000 × qty 10 → margin -100_000
        setupHppMap({ 'variant-A': { totalCost: 1_000_000, qty: 100 } }); // hpp 10_000 per unit, but we set 10k first; to get negative we need sale below HPP
        // Let's set HPP 20_000
        mockGetPeriodCosts.mockResolvedValue([
            {
                productionOrderId: 'po-neg',
                orderNumber: 'PO-NEG',
                materialCost: 0,
                machineCost: 0,
                laborCost: 0,
                totalCost: 2_000_000,
                quantityProduced: 100,
                unitCost: 20_000,
            },
        ]);
        mockProductionOrderFindMany.mockResolvedValue([
            makeProductionOrderMeta('po-neg', 'variant-A'),
        ]);

        const so = makeSO({
            id: 'so-neg',
            items: [makeItem('variant-A', 10, 100_000)], // jual 100k, HPP 200k → margin -100k
        });
        mockSalesOrderFindMany.mockResolvedValue([so]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        const orderRow = report.orders[0];
        expect(orderRow.items[0].margin!.toNumber()).toBe(-100_000);
        expect(orderRow.items[0].margin!.isNegative()).toBe(true);
        expect(orderRow.margin!.isNegative()).toBe(true);
        // isNegativeMargin di breakdown customer harus true
        expect(report.byCustomer[0].isNegativeMargin).toBe(true);
        // byProduct juga negatif
        expect(report.byProduct[0].isNegativeMargin).toBe(true);
    });

    it('SO/item tanpa HPP tersedia ditandai eksplisit (hppCoverage), BUKAN dihitung margin 100% atau 0%', async () => {
        // Arrange: no HPP
        mockGetPeriodCosts.mockResolvedValue([]);
        mockProductionOrderFindMany.mockResolvedValue([]);
        const so = makeSO({
            items: [makeItem('variant-no-hpp', 5, 500_000)],
        });
        mockSalesOrderFindMany.mockResolvedValue([so]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert: NOT margin 0, NOT margin = revenue (=100%)
        const o = report.orders[0];
        expect(o.hppCoverage).toBe('NONE');
        expect(o.margin).toBeNull(); // null, bukan 500k (100%) dan bukan 0
        expect(o.items[0].hppMissing).toBe(true);
        expect(o.items[0].cost).toBeNull();
        expect(o.items[0].margin).toBeNull();
    });

    it('SO dengan sebagian item HPP missing → hppCoverage PARTIAL + badge incomplete', async () => {
        // Arrange: variant-A ada HPP, variant-B tidak
        setupHppMap({ 'variant-A': { totalCost: 500_000, qty: 50 } }); // 10k per unit

        const so = makeSO({
            items: [
                makeItem('variant-A', 10, 200_000), // punya HPP: cost 100k, margin 100k
                makeItem('variant-B', 5, 300_000), // tanpa HPP
            ],
        });
        mockSalesOrderFindMany.mockResolvedValue([so]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert — per spec: PARTIAL = partial margin + hasIncompleteHpp flag
        const o = report.orders[0];
        expect(o.hppCoverage).toBe('PARTIAL');
        expect(o.hasIncompleteHpp).toBe(true);
        // margin = partial (sesuai spec final: "ATAU partial margin dari item yang ada HPP-nya + flag")
        expect(o.margin!.toNumber()).toBe(100_000);
        // marginPartial = only from variant-A (same as margin for PARTIAL case)
        expect(o.marginPartial!.toNumber()).toBe(100_000);
        expect(o.costPartial.toNumber()).toBe(100_000);
        // full cost = null (tidak semua item ada HPP)
        expect(o.cost).toBeNull();
        expect(o.items[0].hppMissing).toBe(false);
        expect(o.items[1].hppMissing).toBe(true);
    });

    it('SO dengan customerId null di-exclude dari laporan', async () => {
        // Arrange
        mockGetPeriodCosts.mockResolvedValue([]);
        mockProductionOrderFindMany.mockResolvedValue([]);
        mockSalesOrderFindMany.mockResolvedValue([]); // service does where customerId not null,
        // but if prisma mock returns data with null customerId, it would be filtered by where already.
        // To test exclude logic, we ensure mock is called with correct where.
        // We'll just verify totalOrders 0 when mock returns empty (which matches the filter).
        // Additional explicit check: prisma where includes customerId not null.

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        const callWhere = mockSalesOrderFindMany.mock.calls[0]?.[0]?.where;
        expect(callWhere).toBeDefined();
        expect(callWhere.customerId).toEqual({ not: null });
        expect(report.orders.length).toBe(0);
        expect(report.summary.totalOrders).toBe(0);
    });

    it('Breakdown per customer/produk/sales menjumlahkan dengan benar (Decimal, bukan float rounding)', async () => {
        // Arrange
        setupHppMap({
            'variant-A': { totalCost: 1_000_000, qty: 100 }, // 10k per unit
            'variant-B': { totalCost: 2_000_000, qty: 100 }, // 20k per unit
        });

        const so1 = makeSO({
            id: 'so-1',
            orderNumber: 'SO-001',
            customerId: 'cust-1',
            salesRepId: 'sales-1',
            customer: { id: 'cust-1', name: 'Toko A' },
            salesRep: { id: 'sales-1', name: 'Sales 1' },
            items: [
                makeItem('variant-A', 10, 150_000, 'SKU-A', 'Produk A'),
            ],
        });
        const so2 = makeSO({
            id: 'so-2',
            orderNumber: 'SO-002',
            customerId: 'cust-1',
            salesRepId: 'sales-1',
            customer: { id: 'cust-1', name: 'Toko A' },
            salesRep: { id: 'sales-1', name: 'Sales 1' },
            items: [
                makeItem('variant-A', 10, 150_000, 'SKU-A', 'Produk A'),
            ],
        });
        const so3 = makeSO({
            id: 'so-3',
            orderNumber: 'SO-003',
            customerId: 'cust-2',
            salesRepId: 'sales-2',
            customer: { id: 'cust-2', name: 'Toko B' },
            salesRep: { id: 'sales-2', name: 'Sales 2' },
            items: [
                makeItem('variant-B', 5, 150_000, 'SKU-B', 'Produk B'),
            ],
        });

        mockSalesOrderFindMany.mockResolvedValue([so1, so2, so3]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert per customer: cust-1 = 300k revenue, cost 200k, margin 100k
        const cust1 = report.byCustomer.find((c) => c.customerId === 'cust-1')!;
        expect(cust1.revenue.equals(dec(300_000))).toBe(true);
        expect(cust1.cost.equals(dec(200_000))).toBe(true);
        expect(cust1.margin.equals(dec(100_000))).toBe(true);
        expect(cust1.orderCount).toBe(2);

        // cust-2: revenue 150k, cost 100k (5*20k), margin 50k
        const cust2 = report.byCustomer.find((c) => c.customerId === 'cust-2')!;
        expect(cust2.revenue.equals(dec(150_000))).toBe(true);
        expect(cust2.cost.equals(dec(100_000))).toBe(true);
        expect(cust2.margin.equals(dec(50_000))).toBe(true);

        // By product: variant-A qty 20, revenue 300k, cost 200k
        const prodA = report.byProduct.find((p) => p.productVariantId === 'variant-A')!;
        expect(prodA.quantity.equals(dec(20))).toBe(true);
        expect(prodA.revenue.equals(dec(300_000))).toBe(true);
        expect(prodA.cost!.equals(dec(200_000))).toBe(true);
        expect(prodA.margin!.equals(dec(100_000))).toBe(true);

        // By sales: sales-1 = 300k revenue, sales-2 = 150k
        const sales1 = report.bySales.find((s) => s.salesRepId === 'sales-1')!;
        expect(sales1.revenue.equals(dec(300_000))).toBe(true);
        const sales2 = report.bySales.find((s) => s.salesRepId === 'sales-2')!;
        expect(sales2.revenue.equals(dec(150_000))).toBe(true);

        // Summary: Decimal precision check — 0.1 + 0.2 style via Decimal, not float
        // We already use string-based Decimal, so no float rounding
        expect(report.summary.totalRevenue.equals(dec(450_000))).toBe(true);
    });

    it('salesRepId null masuk bucket unattributed, bukan dibuang', async () => {
        // Arrange
        setupHppMap({ 'variant-A': { totalCost: 500_000, qty: 50 } });

        const soNoRep = makeSO({
            id: 'so-no-rep',
            salesRepId: null,
            salesRep: null,
            items: [makeItem('variant-A', 10, 200_000)],
        });
        const soWithRep = makeSO({
            id: 'so-with-rep',
            salesRepId: 'sales-1',
            salesRep: { id: 'sales-1', name: 'Sales 1' },
            items: [makeItem('variant-A', 5, 100_000)],
        });

        mockSalesOrderFindMany.mockResolvedValue([soNoRep, soWithRep]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        expect(report.bySales.length).toBe(2);
        const unattributed = report.bySales.find(
            (s) => s.salesRepId === UNATTRIBUTED_SALES_KEY,
        );
        expect(unattributed).toBeDefined();
        expect(unattributed!.revenue.equals(dec(200_000))).toBe(true);
        expect(unattributed!.salesRepName).toBe('Tanpa Sales');

        const withRep = report.bySales.find((s) => s.salesRepId === 'sales-1')!;
        expect(withRep.revenue.equals(dec(100_000))).toBe(true);
    });

    it('default periode pakai startOfMonth/endOfMonth bulan berjalan', async () => {
        // Arrange
        mockSalesOrderFindMany.mockResolvedValue([]);

        // Act
        const report = await getMarginReport(undefined, undefined);

        // Assert
        expect(report.startDate).toBeInstanceOf(Date);
        expect(report.endDate).toBeInstanceOf(Date);
        expect(report.startDate.getDate()).toBe(1);
        expect(report.startDate.getTime()).toBeLessThanOrEqual(report.endDate.getTime());
    });

    it('hanya status CANCELLED yang di-exclude — SO lain termasuk', async () => {
        // Arrange
        mockSalesOrderFindMany.mockResolvedValue([]);
        setupHppMap({});

        // Act
        await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        const where = mockSalesOrderFindMany.mock.calls[0]?.[0]?.where;
        expect(where.status).toEqual({ not: 'CANCELLED' });
    });

    it('marginPercent = margin / revenue * 100 saat FULL, null saat PARTIAL/NONE atau revenue 0', async () => {
        // Arrange
        setupHppMap({ 'variant-A': { totalCost: 500_000, qty: 50 } }); // 10k/unit
        const soFull = makeSO({
            id: 'so-full',
            items: [makeItem('variant-A', 10, 200_000)], // margin 100k, 50%
        });
        const soNone = makeSO({
            id: 'so-none',
            items: [makeItem('variant-B', 5, 100_000)], // no HPP
        });
        mockSalesOrderFindMany.mockResolvedValue([soFull, soNone]);

        // Act
        const report = await getMarginReport(new Date('2026-07-01'), new Date('2026-07-31'));

        // Assert
        const full = report.orders.find((o) => o.id === 'so-full')!;
        expect(full.marginPercent!.toNumber()).toBeCloseTo(50, 1);
        const none = report.orders.find((o) => o.id === 'so-none')!;
        expect(none.marginPercent).toBeNull();

        // byProduct marginPercent null when no HPP
        const prodB = report.byProduct.find((p) => p.productVariantId === 'variant-B')!;
        expect(prodB.marginPercent).toBeNull();

        // prodA marginPercent 50%
        const prodA = report.byProduct.find((p) => p.productVariantId === 'variant-A')!;
        expect(prodA.marginPercent!.toNumber()).toBeCloseTo(50, 1);
    });
});
