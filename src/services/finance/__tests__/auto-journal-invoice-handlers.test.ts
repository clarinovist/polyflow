import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetTenantIdFromContext, mockGetMainPrisma } = vi.hoisted(() => ({
    mockGetTenantIdFromContext: vi.fn(),
    mockGetMainPrisma: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: { findUnique: vi.fn() },
        account: { findUnique: vi.fn(), findFirst: vi.fn() },
    },
    getTenantIdFromContext: mockGetTenantIdFromContext,
    getMainPrisma: mockGetMainPrisma,
}));

vi.mock('../../accounting/accounting-service', () => ({
    AccountingService: { createJournalEntry: vi.fn() },
}));

vi.mock('../../accounting/account-resolver', () => ({
    resolveAccount: vi.fn().mockImplementation(async (role: string) => {
        const map: Record<string, { id: string; code: string; name: string }> = {
            'accounts-receivable': { id: 'acc-ar', code: '11210', name: 'Accounts Receivable' },
            'sales-revenue': { id: 'acc-rev', code: '41100', name: 'Sales Revenue' },
            'vat-output': { id: 'acc-vat', code: '21310', name: 'VAT Output' },
            'vat-input': { id: 'acc-vat-in', code: '21320', name: 'VAT Input' },
            'accounts-payable': { id: 'acc-ap', code: '21110', name: 'AP' },
        };
        return map[role] || { id: 'acc-unknown', code: '00000', name: 'Unknown' };
    }),
    clearAccountCache: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { AccountingService } from '../../accounting/accounting-service';
import {
    handleSalesInvoiceCreated,
    getRevenueRulesForTenant,
} from '../auto-journal-invoice-handlers';

function dec(n: number) {
    return { toNumber: () => n, valueOf: () => n };
}

function mockInvoiceWithItems(
    items: Array<{
        quantity: number;
        unitPrice: number;
        variant?: {
            name: string;
            skuCode: string;
            revenueAccountId?: string | null;
            product?: { name: string; revenueAccountId?: string | null };
        } | null;
    }>,
) {
    return {
        id: 'inv-1',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date('2026-06-01'),
        totalAmount: dec(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)),
        status: 'UNPAID',
        salesOrder: {
            totalAmount: dec(items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)),
            taxAmount: dec(0),
            items: items.map((item, idx) => ({
                id: `item-${idx}`,
                quantity: dec(item.quantity),
                unitPrice: dec(item.unitPrice),
                productVariant: item.variant
                    ? {
                          id: `var-${idx}`,
                          name: item.variant.name,
                          skuCode: item.variant.skuCode,
                          revenueAccountId: item.variant.revenueAccountId,
                          product: item.variant.product
                              ? {
                                    id: `prod-${idx}`,
                                    name: item.variant.product.name,
                                    revenueAccountId: item.variant.product.revenueAccountId,
                                }
                              : null,
                      }
                    : null,
            })),
        },
    };
}

describe('getRevenueRulesForTenant', () => {
    it('returns Melindo rules only for melindo subdomain', () => {
        expect(getRevenueRulesForTenant('melindo').length).toBeGreaterThan(0);
        expect(getRevenueRulesForTenant('kiyowo')).toEqual([]);
        expect(getRevenueRulesForTenant(undefined)).toEqual([]);
        expect(getRevenueRulesForTenant(null)).toEqual([]);
    });
});

describe('handleSalesInvoiceCreated', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetTenantIdFromContext.mockReturnValue(undefined);
        mockGetMainPrisma.mockReturnValue({
            tenant: { findUnique: vi.fn().mockResolvedValue(null) },
        });
    });

    it('creates journal with correct tax split for normal invoice', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(1110000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(1000000), taxAmount: dec(110000), items: [] },
        } as never);

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[0].debit).toBe(1110000);
        expect(call.lines[0].credit).toBe(0);
        expect(call.lines[1].credit).toBeCloseTo(1110000 / (1 + 110000 / 890000), 0);
        // VAT line only when tax > 0
        expect(call.lines[2].credit).toBeCloseTo(
            1110000 - 1110000 / (1 + 110000 / 890000),
            0,
        );
    });

    it('sets taxAmount=0 when sales order has no tax info — no VAT line', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-2',
            invoiceNumber: 'INV-002',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(500000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(0), taxAmount: dec(0), items: [] },
        } as never);

        await handleSalesInvoiceCreated('inv-2');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[0].debit).toBe(500000);
        expect(call.lines[1].credit).toBe(500000);
        // No zero VAT line
        expect(call.lines.length).toBe(2);
    });

    it('handles edge case where soTotal === soTax without division by zero', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-3',
            invoiceNumber: 'INV-003',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(1000000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(100000), taxAmount: dec(100000), items: [] },
        } as never);

        await expect(handleSalesInvoiceCreated('inv-3')).resolves.not.toThrow();
    });

    it('throws when invoice not found', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
        await expect(handleSalesInvoiceCreated('nonexistent')).rejects.toThrow(
            "Invoice"
        );
    });

    it('multi-line: two variants with different revenue accounts', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
            mockInvoiceWithItems([
                {
                    quantity: 10,
                    unitPrice: 50000,
                    variant: {
                        name: 'Rafia Super',
                        skuCode: 'RS-001',
                        revenueAccountId: 'acc-4-102',
                        product: { name: 'Rafia' },
                    },
                },
                {
                    quantity: 5,
                    unitPrice: 30000,
                    variant: {
                        name: 'Sedotan Steril',
                        skuCode: 'SS-001',
                        revenueAccountId: 'acc-4-114',
                        product: { name: 'Sedotan' },
                    },
                },
            ]) as never,
        );

        // @ts-expect-error Prisma mock return type mismatch
        vi.mocked(prisma.account.findUnique).mockImplementation(async ({ where }: Record<string, unknown>) => {
            const map: Record<string, { id: string; code: string; name: string; isActive: boolean }> = {
                'acc-4-102': {
                    id: 'acc-4-102',
                    code: '4-102',
                    name: 'Penjualan Rafia Super',
                    isActive: true,
                },
                'acc-4-114': {
                    id: 'acc-4-114',
                    code: '4-114',
                    name: 'Penjualan Sedotan Steril',
                    isActive: true,
                },
            };
            return (map[(where as { id: string }).id] ?? null) as never;
        });

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[0].accountId).toBe('acc-ar');
        expect(call.lines[0].debit).toBe(650000);

        const revLines = call.lines.filter((l: { accountId: string }) =>
            l.accountId.startsWith('acc-4'),
        );
        expect(revLines.length).toBe(2);
        expect(
            revLines.some(
                (l: { accountId: string; credit: number }) =>
                    l.accountId === 'acc-4-102' && l.credit === 500000,
            ),
        ).toBe(true);
        expect(
            revLines.some(
                (l: { accountId: string; credit: number }) =>
                    l.accountId === 'acc-4-114' && l.credit === 150000,
            ),
        ).toBe(true);
    });

    it('multi-line: same account aggregated', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
            mockInvoiceWithItems([
                {
                    quantity: 10,
                    unitPrice: 50000,
                    variant: {
                        name: 'Rafia Super',
                        skuCode: 'RS-001',
                        revenueAccountId: 'acc-4-102',
                        product: { name: 'Rafia' },
                    },
                },
                {
                    quantity: 5,
                    unitPrice: 50000,
                    variant: {
                        name: 'Rafia KW',
                        skuCode: 'RK-001',
                        revenueAccountId: 'acc-4-102',
                        product: { name: 'Rafia' },
                    },
                },
            ]) as never,
        );

        // @ts-expect-error Prisma mock return type mismatch
        vi.mocked(prisma.account.findUnique).mockImplementation(async ({ where }: Record<string, unknown>) => {
            if ((where as { id: string }).id === 'acc-4-102') {
                return {
                    id: 'acc-4-102',
                    code: '4-102',
                    name: 'Penjualan Rafia Super',
                    isActive: true,
                } as never;
            }
            return null;
        });

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        const revLines = call.lines.filter(
            (l: { accountId: string }) => l.accountId === 'acc-4-102',
        );
        expect(revLines.length).toBe(1);
        expect(revLines[0].credit).toBe(750000);
    });

    it('empty items falls back to single default revenue without VAT when tax=0', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-empty',
            invoiceNumber: 'INV-EMPTY',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(100000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(100000), taxAmount: dec(0), items: [] },
        } as never);

        await handleSalesInvoiceCreated('inv-empty');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines.length).toBe(2);
        expect(call.lines[1].accountId).toBe('acc-rev');
        expect(call.lines[1].credit).toBe(100000);
    });

    it('variant revenue override takes priority over rules', async () => {
        mockGetTenantIdFromContext.mockReturnValue('tenant-melindo');
        mockGetMainPrisma.mockReturnValue({
            tenant: {
                findUnique: vi.fn().mockResolvedValue({ subdomain: 'melindo' }),
            },
        });

        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
            mockInvoiceWithItems([
                {
                    quantity: 10,
                    unitPrice: 50000,
                    variant: {
                        name: 'Rafia Super',
                        skuCode: 'RS-001',
                        revenueAccountId: 'acc-custom',
                        product: { name: 'Rafia' },
                    },
                },
            ]) as never,
        );

        // @ts-expect-error Prisma mock return type mismatch
        vi.mocked(prisma.account.findUnique).mockImplementation(async ({ where }: Record<string, unknown>) => {
            if ((where as { id: string }).id === 'acc-custom') {
                return {
                    id: 'acc-custom',
                    code: '4-999',
                    name: 'Custom Revenue',
                    isActive: true,
                } as never;
            }
            return null;
        });

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[1].accountId).toBe('acc-custom');
    });

    it('Melindo rules apply when subdomain is melindo (no variant override)', async () => {
        mockGetTenantIdFromContext.mockReturnValue('tenant-melindo');
        mockGetMainPrisma.mockReturnValue({
            tenant: {
                findUnique: vi.fn().mockResolvedValue({ subdomain: 'melindo' }),
            },
        });

        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
            mockInvoiceWithItems([
                {
                    quantity: 2,
                    unitPrice: 100000,
                    variant: {
                        name: 'Rafia Hitam Super',
                        skuCode: 'RS-X',
                        product: { name: 'Rafia' },
                    },
                },
            ]) as never,
        );

        // @ts-expect-error Prisma mock return type mismatch
        vi.mocked(prisma.account.findUnique).mockImplementation(async ({ where }: Record<string, unknown>) => {
            const w = where as { code?: string; id?: string };
            if (w.code === '4-102') {
                return {
                    id: 'acc-4-102',
                    code: '4-102',
                    name: 'Penjualan Rafia Super',
                    isActive: true,
                } as never;
            }
            if (w.id === 'acc-4-102') {
                return {
                    id: 'acc-4-102',
                    code: '4-102',
                    name: 'Penjualan Rafia Super',
                    isActive: true,
                } as never;
            }
            return null;
        });

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[1].accountId).toBe('acc-4-102');
        expect(call.lines[1].credit).toBe(200000);
    });

    it('Kiyowo does not apply Melindo rules — uses default sales-revenue', async () => {
        mockGetTenantIdFromContext.mockReturnValue('tenant-kiyowo');
        mockGetMainPrisma.mockReturnValue({
            tenant: {
                findUnique: vi.fn().mockResolvedValue({ subdomain: 'kiyowo' }),
            },
        });

        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
            mockInvoiceWithItems([
                {
                    quantity: 2,
                    unitPrice: 100000,
                    variant: {
                        name: 'Rafia Hitam Super',
                        skuCode: 'RS-X',
                        product: { name: 'Rafia' },
                    },
                },
            ]) as never,
        );

        // If Melindo rules wrongly ran, would look up 4-102 — ensure default path used
        vi.mocked(prisma.account.findUnique).mockResolvedValue(null);

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[1].accountId).toBe('acc-rev');
        expect(call.lines[1].credit).toBe(200000);
    });
});
