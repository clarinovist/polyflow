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
vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: vi.fn(async () => ({
        user: { id: 'finance-contract-user', role: 'ADMIN', roles: ['ADMIN'] },
    })),
}));
vi.mock('@/lib/auth/access-policy', async (original) => ({
    ...(await original<object>()),
    hasWorkspaceEntitlement: () => true,
}));
vi.mock('@/services/finance/finance-dashboard-service', async (original) => ({
    ...(await original<object>()),
    resolveFreshFinanceDashboardAccess: vi.fn(async () => ({
        resources: 'ALL',
    })),
}));

import { getFinanceShiftBoard } from '../finance-dashboard';

const db = database.client;

async function addEntry(
    id: string,
    entryDate: Date,
    status: 'DRAFT' | 'POSTED' | 'VOIDED',
    reference: string,
    amounts: Record<string, number>,
) {
    const lines = Object.entries(amounts)
        .filter(([, amount]) => amount !== 0)
        .map(([accountId, amount]) => ({
            accountId,
            debit: ['cash', 'cogs', 'expense', 'other-expense'].includes(
                accountId,
            )
                ? Math.max(amount, 0)
                : Math.max(-amount, 0),
            credit: ['cash', 'cogs', 'expense', 'other-expense'].includes(
                accountId,
            )
                ? Math.max(-amount, 0)
                : Math.max(amount, 0),
        }));
    await db!.journalEntry.create({
        data: {
            id,
            entryNumber: id,
            entryDate,
            description: 'Synthetic Finance dashboard contract',
            reference,
            referenceType: 'MANUAL_ENTRY',
            status,
            lines: { create: lines },
        },
    });
}

describe.skipIf(!db)(
    'finance dashboard canonical report contract on disposable PostgreSQL',
    () => {
        beforeEach(async () => {
            await verifyReturnTestDatabase(db!);
            await db!.$executeRawUnsafe(
                'TRUNCATE "BankReconciliation", "JournalLine", "JournalEntry", "PurchaseInvoice", "PurchaseOrder", "Invoice", "SalesOrder", "Supplier", "Customer", "FiscalPeriod", "Account" CASCADE',
            );
            await db!.account.createMany({
                data: [
                    {
                        id: 'non-cash',
                        code: '11100',
                        name: 'Synthetic prefix-only asset',
                        type: 'ASSET',
                        category: 'CURRENT_ASSET',
                        isCashAccount: false,
                    },
                    {
                        id: 'cash',
                        code: '99901',
                        name: 'Synthetic configured cash',
                        type: 'ASSET',
                        category: 'CURRENT_ASSET',
                        isCashAccount: true,
                    },
                    {
                        id: 'revenue',
                        code: 'X-REV',
                        name: 'Synthetic revenue',
                        type: 'REVENUE',
                        category: 'OPERATING_REVENUE',
                    },
                    {
                        id: 'cogs',
                        code: 'X-COGS',
                        name: 'Synthetic COGS',
                        type: 'EXPENSE',
                        category: 'COGS',
                    },
                    {
                        id: 'expense',
                        code: 'X-OPEX',
                        name: 'Synthetic operating expense',
                        type: 'EXPENSE',
                        category: 'OPERATING_EXPENSE',
                    },
                    {
                        id: 'other-revenue',
                        code: 'X-OTHER-R',
                        name: 'Synthetic other revenue',
                        type: 'REVENUE',
                        category: 'OTHER_REVENUE',
                    },
                    {
                        id: 'other-expense',
                        code: 'X-OTHER-E',
                        name: 'Synthetic other expense',
                        type: 'EXPENSE',
                        category: 'OTHER_EXPENSE',
                    },
                ],
            });
            await addEntry(
                'OPENING',
                new Date('2026-03-15T00:00:00.000Z'),
                'POSTED',
                'OPENING',
                { cash: 1_000, 'non-cash': 50_000 },
            );
            await addEntry(
                'IN-RANGE',
                new Date('2026-04-15T00:00:00.000Z'),
                'POSTED',
                'NORMAL',
                {
                    cash: 200,
                    revenue: 1_000,
                    cogs: 300,
                    expense: 100,
                    'other-revenue': 50,
                    'other-expense': 20,
                },
            );
            await addEntry(
                'END-BOUNDARY',
                new Date('2026-04-30T16:59:59.999Z'),
                'POSTED',
                'NORMAL-END',
                { cash: 20, revenue: 100 },
            );
            await addEntry(
                'AFTER',
                new Date('2026-04-30T17:00:00.000Z'),
                'POSTED',
                'AFTER',
                { cash: 9_000, revenue: 9_000 },
            );
            await addEntry(
                'DRAFT',
                new Date('2026-04-20T00:00:00.000Z'),
                'DRAFT',
                'DRAFT',
                { cash: 8_000, revenue: 8_000 },
            );
            await addEntry(
                'CLOSING',
                new Date('2026-04-29T00:00:00.000Z'),
                'POSTED',
                'CLOSING-2026-04',
                { revenue: 7_000 },
            );
        });

        afterAll(async () => {
            await db?.$disconnect();
        });

        it('reconciles Health with category-based P&L and configured cash as-of', async () => {
            const result = await getFinanceShiftBoard({
                startDate: new Date('2026-04-01T00:00:00+07:00'),
                endDate: new Date('2026-04-30T00:00:00+07:00'),
            });

            expect(result.success).toBe(true);
            if (
                !result.success ||
                !result.data ||
                result.data.state !== 'AVAILABLE'
            )
                return;
            expect(result.data.health).toEqual({
                cash: { state: 'AVAILABLE', value: 1_220 },
                revenue: { state: 'AVAILABLE', value: 1_100 },
                grossProfit: { state: 'AVAILABLE', value: 800 },
                netProfit: { state: 'AVAILABLE', value: 730 },
            });
            expect(result.data.period?.asOfLabel).toBe('30 Apr 2026');
        });

        it('computes complete totals before deterministic global top-five sampling', async () => {
            await db!.customer.create({
                data: { id: 'customer', name: 'Synthetic customer' },
            });
            await db!.salesOrder.create({
                data: {
                    id: 'sales-order',
                    orderNumber: 'SO-FINANCE-CONTRACT',
                    customerId: 'customer',
                },
            });
            await db!.supplier.create({
                data: { id: 'supplier', name: 'Synthetic supplier' },
            });
            await db!.purchaseOrder.create({
                data: {
                    id: 'purchase-order',
                    orderNumber: 'PO-FINANCE-CONTRACT',
                    supplierId: 'supplier',
                },
            });
            const dueDate = new Date('2020-01-01T00:00:00.000Z');
            await db!.invoice.createMany({
                data: Array.from({ length: 7 }, (_, index) => ({
                    id: `ar-${String(index + 1).padStart(2, '0')}`,
                    invoiceNumber: `INV-${String(index + 1).padStart(2, '0')}`,
                    salesOrderId: 'sales-order',
                    dueDate,
                    status: 'PARTIAL' as const,
                    totalAmount: 100,
                    paidAmount: 10,
                    creditedAmount: 5,
                    priceAdjustmentAmount: 2,
                })),
            });
            await db!.purchaseInvoice.createMany({
                data: Array.from({ length: 7 }, (_, index) => ({
                    id: `ap-${String(index + 1).padStart(2, '0')}`,
                    invoiceNumber: `PI-${String(index + 1).padStart(2, '0')}`,
                    purchaseOrderId: 'purchase-order',
                    dueDate,
                    status: 'PARTIAL' as const,
                    totalAmount: 200,
                    paidAmount: 50,
                })),
            });

            const result = await getFinanceShiftBoard({
                startDate: new Date('2026-04-01T00:00:00+07:00'),
                endDate: new Date('2026-04-30T00:00:00+07:00'),
            });

            expect(result.success).toBe(true);
            if (
                !result.success ||
                !result.data ||
                result.data.state !== 'AVAILABLE'
            )
                return;
            expect(result.data.attention?.arOverdue).toMatchObject({
                total: 7,
                amount: 609,
                returned: 5,
            });
            expect(
                result.data.attention?.arOverdue?.items.map((item) => item.id),
            ).toEqual(['ar-01', 'ar-02', 'ar-03', 'ar-04', 'ar-05']);
            expect(result.data.attention?.apOverdue).toMatchObject({
                total: 7,
                amount: 1_050,
                returned: 5,
            });
            expect(
                result.data.attention?.apOverdue?.items.map((item) => item.id),
            ).toEqual(['ap-01', 'ap-02', 'ap-03', 'ap-04', 'ap-05']);
        });
    },
);
