import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyReturnTestDatabase } from '@/services/finance/__tests__/return-credit-postgres-fixture';

const { database, mockSession } = vi.hoisted(() => ({
    database: { client: null as import('@prisma/client').PrismaClient | null },
    mockSession: { roles: ['FINANCE'] },
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

vi.mock('@/lib/tools/auth-checks', () => ({
    requireAuth: vi.fn(async () => ({
        user: {
            id: 'finance-test-user',
            role: mockSession.roles[0],
            roles: mockSession.roles,
        },
    })),
}));

import { getFinanceShiftBoard } from '../finance-dashboard';

const db = database.client;

async function addEntry(
    id: string,
    entryDate: Date,
    status: 'DRAFT' | 'POSTED',
    amounts: { cash?: number; ar?: number; ap?: number; revenue?: number },
) {
    const lines = [
        amounts.cash
            ? { accountId: 'cash', debit: Math.max(amounts.cash, 0), credit: Math.max(-amounts.cash, 0) }
            : null,
        amounts.ar
            ? { accountId: 'ar', debit: Math.max(amounts.ar, 0), credit: Math.max(-amounts.ar, 0) }
            : null,
        amounts.ap
            ? { accountId: 'ap', debit: Math.max(-amounts.ap, 0), credit: Math.max(amounts.ap, 0) }
            : null,
        amounts.revenue
            ? { accountId: 'revenue', debit: Math.max(-amounts.revenue, 0), credit: Math.max(amounts.revenue, 0) }
            : null,
    ].filter((line): line is NonNullable<typeof line> => line !== null);
    await db!.journalEntry.create({
        data: {
            id,
            entryNumber: id,
            entryDate,
            description: 'Synthetic finance dashboard contract',
            reference: id,
            referenceType: 'MANUAL_ENTRY',
            status,
            lines: { create: lines },
        },
    });
}

describe.skipIf(!db)(
    'finance dashboard as-of contract on disposable PostgreSQL',
    () => {
        beforeEach(async () => {
            await verifyReturnTestDatabase(db!);
            await db!.$executeRawUnsafe(
                'TRUNCATE "BankReconciliation", "JournalLine", "JournalEntry", "PurchaseInvoice", "Invoice", "FiscalPeriod", "Account" CASCADE',
            );
            await db!.account.createMany({
                data: [
                    { id: 'cash', code: '11110', name: 'Synthetic Cash', type: 'ASSET', category: 'CURRENT_ASSET' },
                    { id: 'ar', code: '11210', name: 'Synthetic AR', type: 'ASSET', category: 'CURRENT_ASSET' },
                    { id: 'ap', code: '21110', name: 'Synthetic AP', type: 'LIABILITY', category: 'CURRENT_LIABILITY' },
                    { id: 'revenue', code: '41100', name: 'Synthetic Revenue', type: 'REVENUE', category: 'OPERATING_REVENUE' },
                ],
            });
            await addEntry('OPENING', new Date('2026-06-15T00:00:00.000Z'), 'POSTED', { cash: 1_000, ar: 600, ap: 400 });
            await addEntry('IN-RANGE', new Date('2026-07-15T00:00:00.000Z'), 'POSTED', { cash: 200, ar: 100, ap: 50, revenue: 900 });
            await addEntry('END-BOUNDARY', new Date('2026-07-31T16:59:59.999Z'), 'POSTED', { cash: 20, ar: 10, ap: 5, revenue: 100 });
            await addEntry('AFTER', new Date('2026-07-31T17:00:00.000Z'), 'POSTED', { cash: 9_000, ar: 9_000, ap: 9_000, revenue: 9_000 });
            await addEntry('DRAFT', new Date('2026-07-20T00:00:00.000Z'), 'DRAFT', { cash: 8_000, ar: 8_000, ap: 8_000, revenue: 8_000 });
        });

        afterAll(async () => {
            await db?.$disconnect();
        });

        it('reconciles as-of balances and keeps revenue period-bound', async () => {
            const endDate = new Date('2026-07-31T00:00:00.000Z');
            const first = await getFinanceShiftBoard({
                startDate: new Date('2026-07-01T00:00:00.000Z'),
                endDate,
            });
            const second = await getFinanceShiftBoard({
                startDate: new Date('2026-07-10T00:00:00.000Z'),
                endDate,
            });

            expect(first.success && first.data?.snapshot).toMatchObject({
                revenue: 1_000,
                cashPosition: 1_220,
                arGl: 710,
                apGl: 455,
                asOfLabel: '31 Jul 2026',
            });
            expect(second.success && second.data?.snapshot).toMatchObject({
                revenue: 1_000,
                cashPosition: 1_220,
                arGl: 710,
                apGl: 455,
            });
        });
    },
);
