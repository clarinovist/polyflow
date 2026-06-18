import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: { findUnique: vi.fn() },
        account: { findUnique: vi.fn(), findFirst: vi.fn() },
    }
}));

vi.mock('../../accounting/accounting-service', () => ({
    AccountingService: { createJournalEntry: vi.fn() }
}));

vi.mock('../../accounting/account-resolver', () => ({
    resolveAccount: vi.fn().mockImplementation(async (role: string) => {
        const map: Record<string, { id: string; code: string; name: string }> = {
            'accounts-receivable': { id: 'acc-ar', code: '11210', name: 'Accounts Receivable' },
            'sales-revenue': { id: 'acc-rev', code: '41100', name: 'Sales Revenue' },
            'vat-output': { id: 'acc-vat', code: '21310', name: 'VAT Output' },
        };
        return map[role] || { id: 'acc-unknown', code: '00000', name: 'Unknown' };
    }),
}));

import { prisma } from '@/lib/core/prisma';
import { AccountingService } from '../../accounting/accounting-service';
import { handleSalesInvoiceCreated } from '../auto-journal-invoice-handlers';

// Helper: create a mock that Number() can coerce (like Prisma Decimal)
function dec(n: number) {
    return { toNumber: () => n, valueOf: () => n };
}

describe('handleSalesInvoiceCreated', () => {
    beforeEach(() => vi.clearAllMocks());

    it('creates journal with correct tax split for normal invoice', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(1110000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(1000000), taxAmount: dec(110000) },
        } as never);

        await handleSalesInvoiceCreated('inv-1');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        // AR = full amount
        expect(call.lines[0].debit).toBe(1110000);
        expect(call.lines[0].credit).toBe(0);
        // Revenue = totalAmount / (1 + taxRate) where taxRate = 110000/890000
        expect(call.lines[1].credit).toBeCloseTo(1110000 / (1 + 110000 / 890000), 0);
        // VAT = totalAmount - netAmount
        expect(call.lines[2].credit).toBeCloseTo(1110000 - 1110000 / (1 + 110000 / 890000), 0);
    });

    it('sets taxAmount=0 when sales order has no tax info', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-2',
            invoiceNumber: 'INV-002',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(500000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(0), taxAmount: dec(0) },
        } as never);

        await handleSalesInvoiceCreated('inv-2');

        const call = vi.mocked(AccountingService.createJournalEntry).mock.calls[0][0];
        expect(call.lines[0].debit).toBe(500000); // AR full
        expect(call.lines[1].credit).toBe(500000); // Revenue full
        expect(call.lines[2].credit).toBe(0);       // No tax
    });

    it('handles edge case where soTotal === soTax without division by zero', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            id: 'inv-3',
            invoiceNumber: 'INV-003',
            invoiceDate: new Date('2026-06-01'),
            totalAmount: dec(1000000),
            status: 'UNPAID',
            salesOrder: { totalAmount: dec(100000), taxAmount: dec(100000) },
        } as never);

        // Should not throw — edge case guarded
        await expect(handleSalesInvoiceCreated('inv-3')).resolves.not.toThrow();
    });

    it('throws when invoice not found', async () => {
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);
        await expect(handleSalesInvoiceCreated('nonexistent')).rejects.toThrow('Invoice nonexistent not found');
    });
});
