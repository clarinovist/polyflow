import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getFinanceMobileOverview } from '../mobile-dashboard';
import { prisma } from '@/lib/core/prisma';
import { auth } from '@/auth';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
        },
        invoice: {
            findMany: vi.fn(),
        },
        purchaseInvoice: {
            findMany: vi.fn(),
        },
        journalEntry: {
            count: vi.fn(),
        },
        bankReconciliation: {
            count: vi.fn(),
        },
    },
}));

vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

describe('getFinanceMobileOverview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(prisma.user.findUnique).mockResolvedValue({
            id: 'u1',
            role: 'FINANCE',
            isActive: true,
        } as any);
    });

    it('returns empty finance overview when authenticated', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'FINANCE' },
        } as any);

        vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.journalEntry.count).mockResolvedValue(0);
        vi.mocked(prisma.bankReconciliation.count).mockResolvedValue(0);

        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.overdueArCount).toBe(0);
            expect(result.data.highlights.draftJournalCount).toBe(0);
        }
    });

    it('returns AR/AP overdue summary and draft journals count', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'FINANCE' },
        } as any);

        vi.mocked(prisma.invoice.findMany).mockResolvedValue([
            {
                id: 'inv-1',
                invoiceNumber: 'INV-001',
                totalAmount: 10000000,
                status: 'OVERDUE',
                dueDate: new Date(),
                salesOrder: { customer: { name: 'Toko Makmur' } },
            } as any,
        ]);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.journalEntry.count).mockResolvedValue(4);
        vi.mocked(prisma.bankReconciliation.count).mockResolvedValue(1);

        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.overdueArCount).toBe(1);
            expect(result.data.highlights.overdueArAmount).toBe(10000000);
            expect(result.data.highlights.draftJournalCount).toBe(4);
            expect(result.data.highlights.openReconCount).toBe(1);
            expect(result.data.recentInvoices[0].invoiceNumber).toBe('INV-001');
        }
    });

    it('handles database errors gracefully and returns default values', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u1', role: 'FINANCE' },
        } as any);

        vi.mocked(prisma.invoice.findMany).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.purchaseInvoice.findMany).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.journalEntry.count).mockRejectedValue(new Error('DB Error'));
        vi.mocked(prisma.bankReconciliation.count).mockRejectedValue(new Error('DB Error'));

        const result = await getFinanceMobileOverview();
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.highlights.overdueArCount).toBe(0);
            expect(result.data.highlights.overdueApCount).toBe(0);
            expect(result.data.highlights.draftJournalCount).toBe(0);
            expect(result.data.highlights.openReconCount).toBe(0);
        }
    });
});
