import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';

const { database } = vi.hoisted(() => ({
    database: {
        client: null as import('@prisma/client').PrismaClient | null,
    },
}));

vi.mock('@/lib/core/prisma', async () => {
    const { returnTestClient } = await import(
        '@/services/finance/__tests__/return-credit-postgres-fixture'
    );
    database.client = process.env.RETURN_CREDIT_TEST_DATABASE_URL
        ? returnTestClient(process.env.RETURN_CREDIT_TEST_DATABASE_URL)
        : null;
    return { prisma: database.client };
});

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: (...args: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/auth/sales-access', () => ({
    requireSalesAccess: vi.fn(async () => ({
        user: { id: 'sales-contract-user', role: 'ADMIN', roles: ['ADMIN'] },
    })),
}));

vi.mock('@/lib/auth/access-policy', async (original) => ({
    ...(await original<object>()),
    hasWorkspaceEntitlement: () => true,
}));

vi.mock('@/services/sales/sales-dashboard-service', async (original) => ({
    ...(await original<object>()),
    resolveFreshSalesDashboardAccess: vi.fn(async () => ({
        user: {
            id: 'sales-contract-user',
            role: 'ADMIN',
            roles: ['ADMIN'],
        },
        resources: 'ALL',
        canViewNominal: false,
    })),
}));

import { getSalesDashboardStats } from '../sales-dashboard';

const db = database.client;

function orderId(index: number) {
    return `ready-${String(index).padStart(2, '0')}`;
}

describe.skipIf(!db)(
    'sales dashboard READY relation filter on disposable PostgreSQL',
    () => {
        beforeEach(async () => {
            await verifyReturnTestDatabase(db!);
            await db!.$executeRawUnsafe(
                'TRUNCATE "DeliveryOrder", "SalesOrder", "Location", "Customer" CASCADE',
            );
            await db!.location.create({
                data: {
                    id: 'ready-location',
                    name: 'Synthetic READY location',
                    slug: 'ready-contract-location',
                },
            });
            await db!.salesOrder.createMany({
                data: Array.from({ length: 26 }, (_, offset) => ({
                    id: orderId(offset + 1),
                    orderNumber: `SO-READY-${String(offset + 1).padStart(2, '0')}`,
                    status: 'READY_TO_SHIP' as const,
                    createdAt: new Date('2026-10-09T00:00:00.000Z'),
                })),
            });
            await db!.deliveryOrder.createMany({
                data: Array.from({ length: 20 }, (_, offset) => ({
                    id: `do-${String(offset + 1).padStart(2, '0')}`,
                    orderNumber: `DO-${String(offset + 1).padStart(2, '0')}`,
                    salesOrderId: orderId(offset + 1),
                    sourceLocationId: 'ready-location',
                    status: offset % 2 === 0 ? ('PENDING' as const) : ('LOADING' as const),
                })),
            });
        });

        afterAll(async () => {
            await db?.$disconnect();
        });

        it('filters all READY rows before deterministic top-five sampling', async () => {
            const result = await getSalesDashboardStats();

            expect(result.success).toBe(true);
            if (!result.success || !result.data) return;
            expect(result.data.state).toBe('AVAILABLE');
            if (result.data.state !== 'AVAILABLE') return;
            expect(result.data.attention?.counts.readyWithoutDo).toBe(6);
            expect(
                result.data.attention?.readyWithoutDo?.items.map(
                    (order) => order.id,
                ),
            ).toEqual([
                'ready-21',
                'ready-22',
                'ready-23',
                'ready-24',
                'ready-25',
            ]);
        });
    },
);
