import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

const mocks = vi.hoisted(() => ({
    prisma: {
        user: { findUnique: vi.fn(), findMany: vi.fn() },
        rolePermission: { findMany: vi.fn() },
        salesOrder: { count: vi.fn(), findMany: vi.fn() },
        salesReturn: { findMany: vi.fn() },
        salesVisit: { count: vi.fn() },
        deliveryOrder: { count: vi.fn(), findMany: vi.fn() },
        deliveryScheduleVehicle: { count: vi.fn() },
        invoice: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
        customer: { count: vi.fn() },
    },
    pipeline: vi.fn(),
    credit: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/services/sales/pipeline-service', () => ({
    getPipelineData: mocks.pipeline,
}));
vi.mock('@/services/sales/credit-service', () => ({
    getTopCustomerCreditRiskSnapshot: mocks.credit,
}));

import {
    readSalesAttention,
    readSalesPipelineDashboard,
    resolveFreshSalesDashboardAccess,
    readSalesRevenueAndOrders,
    readSalesVisitActual,
    resolveSalesDashboardPeriod,
    resolveSalesDashboardScope,
    type SalesDashboardScope,
} from '../sales-dashboard-service';

const companyScope: SalesDashboardScope = {
    kind: 'COMPANY',
    label: 'Seluruh perusahaan',
    actorUserId: 'admin',
    fieldScope: { actorUserId: 'admin', isGlobalViewer: true },
};
const myScope: SalesDashboardScope = {
    kind: 'MY',
    label: 'Portofolio saya',
    actorUserId: 'sales-1',
    fieldScope: { actorUserId: 'sales-1', isGlobalViewer: false },
};
const period = {
    start: new Date('2026-09-30T17:00:00.000Z'),
    end: new Date('2026-10-09T16:59:59.999Z'),
    label: '01 Okt 2026 – 09 Okt 2026',
};

describe('sales-dashboard-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.prisma.user.findUnique.mockResolvedValue({
            id: 'admin',
            role: 'ADMIN',
            isActive: true,
            roles: [],
        });
        mocks.prisma.rolePermission.findMany.mockResolvedValue([]);
        mocks.prisma.salesOrder.count.mockResolvedValue(0);
        mocks.prisma.salesOrder.findMany.mockResolvedValue([]);
        mocks.prisma.salesReturn.findMany.mockResolvedValue([]);
        mocks.prisma.salesVisit.count.mockResolvedValue(0);
        mocks.prisma.deliveryOrder.count.mockResolvedValue(0);
        mocks.prisma.deliveryOrder.findMany.mockResolvedValue([]);
        mocks.prisma.deliveryScheduleVehicle.count.mockResolvedValue(0);
        mocks.prisma.invoice.count.mockResolvedValue(0);
        mocks.prisma.invoice.aggregate.mockResolvedValue({
            _sum: { remainingAmount: null },
        });
        mocks.prisma.invoice.findMany.mockResolvedValue([]);
        mocks.prisma.customer.count.mockResolvedValue(0);
        mocks.credit.mockResolvedValue({ total: 0, returned: 0, items: [] });
        mocks.pipeline.mockResolvedValue({
            stagesByKey: {
                QUOTATION: { count: 0, totalValue: new Decimal(0) },
                QUOTATION_SENT: { count: 0, totalValue: new Decimal(0) },
            },
            lostReasonBreakdown: [],
        });
    });

    it('normalizes default MTD and a custom range to inclusive WIB bounds', () => {
        const mtd = resolveSalesDashboardPeriod(
            undefined,
            new Date('2026-10-09T02:00:00.000Z'),
        );
        expect(mtd.start).toEqual(new Date('2026-09-30T17:00:00.000Z'));
        expect(mtd.end).toEqual(new Date('2026-10-09T16:59:59.999Z'));

        const custom = resolveSalesDashboardPeriod({
            from: new Date('2026-10-02T00:00:00+07:00'),
            to: new Date('2026-10-03T00:00:00+07:00'),
        });
        expect(custom.start).toEqual(new Date('2026-10-01T17:00:00.000Z'));
        expect(custom.end).toEqual(new Date('2026-10-03T16:59:59.999Z'));
    });

    it('resolves fresh roles/resources and fails closed after role revocation', async () => {
        mocks.prisma.user.findUnique.mockResolvedValueOnce({
            id: 'sales-1',
            role: 'SALES',
            isActive: true,
            roles: [{ role: 'MARKETING' }],
        });
        mocks.prisma.rolePermission.findMany.mockResolvedValueOnce([
            { resource: '/sales/orders' },
            { resource: 'feature:view-prices' },
        ]);

        await expect(resolveFreshSalesDashboardAccess('sales-1')).resolves.toEqual({
            user: {
                id: 'sales-1',
                role: 'SALES',
                roles: ['SALES', 'MARKETING'],
            },
            resources: ['/sales/orders', 'feature:view-prices'],
            canViewNominal: true,
        });

        mocks.prisma.user.findUnique.mockResolvedValueOnce({
            id: 'revoked',
            role: 'WAREHOUSE',
            isActive: true,
            roles: [],
        });
        await expect(resolveFreshSalesDashboardAccess('revoked')).rejects.toThrow(
            /Unauthorized/,
        );
        expect(mocks.prisma.rolePermission.findMany).toHaveBeenCalledTimes(1);
    });

    it('labels ADMIN as company, MARKETING as active team, and SALES as my scope', async () => {
        mocks.prisma.user.findMany.mockResolvedValue([
            { id: 'sales-a' },
            { id: 'sales-b' },
        ]);

        await expect(
            resolveSalesDashboardScope({ id: 'admin', role: 'ADMIN' }),
        ).resolves.toMatchObject({ kind: 'COMPANY' });
        await expect(
            resolveSalesDashboardScope({ id: 'marketing', role: 'MARKETING' }),
        ).resolves.toMatchObject({
            kind: 'TEAM',
            fieldScope: { salesRepIds: ['sales-a', 'sales-b'] },
        });
        await expect(
            resolveSalesDashboardScope({ id: 'sales', role: 'SALES' }),
        ).resolves.toMatchObject({
            kind: 'MY',
            fieldScope: { actorUserId: 'sales', isGlobalViewer: false },
        });
    });

    it('uses SALES_ORDER minus processed return for actual and six completed comparable months', async () => {
        mocks.prisma.salesOrder.findMany.mockResolvedValue([
            {
                id: 'current',
                salesRepId: 'sales-1',
                totalAmount: new Decimal(1_000),
                status: 'CONFIRMED',
                orderDate: new Date('2026-10-02T00:00:00.000Z'),
            },
            {
                id: 'april',
                salesRepId: 'sales-1',
                totalAmount: new Decimal(500),
                status: 'DELIVERED',
                orderDate: new Date('2026-04-02T00:00:00.000Z'),
            },
        ]);
        mocks.prisma.salesReturn.findMany.mockResolvedValue([
            {
                id: 'return-current',
                totalAmount: new Decimal(200),
                status: 'COMPLETED',
                returnDate: new Date('2026-10-03T00:00:00.000Z'),
                salesOrder: { salesRepId: 'sales-1' },
            },
        ]);

        const result = await readSalesRevenueAndOrders(
            companyScope,
            period,
            true,
        );

        expect(result.orderActual).toBe(1);
        expect(result.revenueActual).toBe(800);
        expect(result.revenueTrend).toHaveLength(6);
        expect(result.revenueTrend[0]).toEqual({
            month: '2026-04',
            revenue: 500,
        });
        expect(result.revenueTrend.at(-1)).toEqual({
            month: '2026-09',
            revenue: 0,
        });
        expect(mocks.prisma.salesOrder.findMany).toHaveBeenCalledTimes(1);
        expect(mocks.prisma.salesOrder.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    status: { not: 'CANCELLED' },
                }),
            }),
        );
        expect(mocks.prisma.salesReturn.findMany).toHaveBeenCalledTimes(1);
    });

    it('does not read or emit nominal revenue without capability', async () => {
        mocks.prisma.salesOrder.count.mockResolvedValue(4);

        const result = await readSalesRevenueAndOrders(
            myScope,
            period,
            false,
        );

        expect(result).toEqual({
            orderActual: 4,
            revenueActual: null,
            revenueTrend: [],
        });
        expect(mocks.prisma.salesOrder.findMany).not.toHaveBeenCalled();
        expect(mocks.prisma.salesReturn.findMany).not.toHaveBeenCalled();
    });

    it('scopes visit actual to MY and excludes REJECTED', async () => {
        mocks.prisma.salesVisit.count.mockResolvedValue(7);
        await expect(readSalesVisitActual(myScope, period)).resolves.toBe(7);
        expect(mocks.prisma.salesVisit.count).toHaveBeenCalledWith({
            where: {
                userId: 'sales-1',
                checkInTime: { gte: period.start, lte: period.end },
                reviewStatus: { not: 'REJECTED' },
            },
        });
    });

    it('reuses canonical pipeline data and omits value without capability', async () => {
        mocks.pipeline.mockResolvedValue({
            stagesByKey: {
                QUOTATION: { count: 2, totalValue: new Decimal(1_000) },
                QUOTATION_SENT: { count: 3, totalValue: new Decimal(2_000) },
            },
            lostReasonBreakdown: [
                {
                    reason: 'PRICE',
                    label: 'Harga',
                    count: 4,
                    totalValue: new Decimal(900),
                },
            ],
        });

        await expect(
            readSalesPipelineDashboard(myScope, period, false),
        ).resolves.toEqual({
            activeCount: 5,
            activeValue: null,
            topLostReason: {
                reason: 'PRICE',
                label: 'Harga',
                count: 4,
                totalValue: null,
            },
        });
        expect(mocks.pipeline).toHaveBeenCalledWith(
            myScope.fieldScope,
            period.start,
            period.end,
        );
    });

    it('preserves total vs returned and deterministic full-population filters for Attention', async () => {
        mocks.prisma.salesOrder.count
            .mockResolvedValueOnce(8)
            .mockResolvedValueOnce(30)
            .mockResolvedValueOnce(27)
            .mockResolvedValueOnce(9);
        mocks.prisma.salesOrder.findMany
            .mockResolvedValueOnce([
                {
                    id: 'draft-1',
                    orderNumber: 'SO-DRAFT',
                    createdAt: new Date('2026-10-01T00:00:00.000Z'),
                    customer: { name: 'A' },
                },
            ])
            .mockResolvedValueOnce([
                { id: 'ready-21', orderNumber: 'SO-READY-21', customer: { name: 'B' } },
            ])
            .mockResolvedValueOnce([]);
        mocks.prisma.deliveryOrder.count.mockResolvedValue(3);
        mocks.prisma.deliveryOrder.findMany.mockResolvedValue([]);
        mocks.prisma.invoice.count.mockResolvedValue(2);
        mocks.prisma.invoice.findMany.mockResolvedValue([]);
        mocks.credit.mockResolvedValue({
            total: 6,
            returned: 5,
            items: Array.from({ length: 5 }, (_, index) => ({
                id: 'risk-' + index,
                name: 'Risk ' + index,
                exposureStatus: 'near' as const,
                headroom: index,
            })),
        });
        mocks.prisma.deliveryScheduleVehicle.count.mockResolvedValue(1);
        mocks.prisma.customer.count.mockResolvedValue(20);

        const result = await readSalesAttention(companyScope, new Date('2026-10-09T02:00:00.000Z'), false);

        expect(result.oldDrafts).toMatchObject({ total: 8, returned: 1 });
        expect(result.readyWithoutDo).toMatchObject({ total: 27, returned: 1 });
        expect(result.creditRisk).toMatchObject({ total: 6, returned: 5 });
        expect(mocks.prisma.deliveryScheduleVehicle.count).toHaveBeenCalledWith({
            where: expect.objectContaining({
                departureDate: new Date('2026-10-08T17:00:00.000Z'),
            }),
        });
        const readyQuery = mocks.prisma.salesOrder.findMany.mock.calls[1][0];
        expect(readyQuery).toMatchObject({
            take: 5,
            where: {
                status: 'READY_TO_SHIP',
                deliveryOrders: {
                    none: { status: { in: ['PENDING', 'LOADING'] } },
                },
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        expect(mocks.prisma.invoice.aggregate).not.toHaveBeenCalled();
    });

    it('skips resource-owned attention queries that are not granted', async () => {
        const result = await readSalesAttention(
            companyScope,
            new Date('2026-10-09T02:00:00.000Z'),
            true,
            {
                orders: true,
                deliveries: false,
                deliverySchedules: false,
                invoices: false,
                customers: false,
            },
        );

        expect(result.openDeliveries).toBeNull();
        expect(result.overdueInvoices).toBeNull();
        expect(result.creditRisk).toBeNull();
        expect(result.counts.tripsToday).toBeNull();
        expect(mocks.prisma.deliveryOrder.count).not.toHaveBeenCalled();
        expect(mocks.prisma.deliveryScheduleVehicle.count).not.toHaveBeenCalled();
        expect(mocks.prisma.invoice.count).not.toHaveBeenCalled();
        expect(mocks.prisma.invoice.aggregate).not.toHaveBeenCalled();
        expect(mocks.credit).not.toHaveBeenCalled();
        expect(mocks.prisma.salesOrder.count).toHaveBeenCalled();
    });

    it('marks Attention unavailable but keeps successful groups', async () => {
        mocks.prisma.deliveryOrder.count.mockRejectedValue(new Error('delivery unavailable'));

        const result = await readSalesAttention(
            companyScope,
            new Date('2026-10-09T02:00:00.000Z'),
            false,
        );

        expect(result.state).toBe('UNAVAILABLE');
        expect(result.openDeliveries).toBeNull();
        expect(result.oldDrafts).not.toBeNull();
        expect(result.counts.openDeliveryOrders).toBeNull();
        expect(result.counts.draftOrders).toBe(0);
    });
});
