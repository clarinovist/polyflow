import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError } from '@/lib/errors/errors';

// ── Mocks ───────────────────────────────────────────────────────────────
vi.mock('@/lib/core/tenant', () => ({
    withTenant: (fn: any) => fn,
    getTenantContext: () => ({ tenantId: 'test-tenant' }),
}));

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: {
            findUnique: vi.fn(),
        },
        user: {
            findUnique: vi.fn(),
        },
    },
    getTenantIdFromContext: () => 'test-tenant',
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/auth/finance-access', () => ({
    requireFinanceAccess: vi.fn(),
    requireFinanceMutation: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    requireFinanceReadCrossPortal: vi.fn(),
}));

vi.mock('@/lib/utils/utils', () => ({
    serializeData: vi.fn((d: any) => d),
}));

vi.mock('@/services/finance/invoice-service', () => ({
    InvoiceService: {
        createInvoice: vi.fn(),
        updateStatus: vi.fn(),
        updateSalesInvoiceDueDate: vi.fn(),
    },
}));

const AUTH_MOCK_ID = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

import { prisma } from '@/lib/core/prisma';
import { InvoiceService } from '@/services/finance/invoice-service';
import { requireFinanceMutation } from '@/lib/auth/finance-access';

describe('updateInvoiceStatus action — error forwarding (regression fix 2026-08-05)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireFinanceMutation).mockResolvedValue({
            user: { id: AUTH_MOCK_ID },
        } as any);
        // prisma.invoice used only for revalidate lookup after success — default success path
        vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
            salesOrderId: '11111111-1111-4111-8111-111111111111',
        } as any);
    });

    it('should forward original BusinessRuleError message when InvoiceService throws DRAFT guard error', async () => {
        // Arrange: service throws DRAFT guard error (EMERGENCY_DISPATCH case)
        const draftError = new BusinessRuleError(
            'Invoice masih DRAFT. Finance harus approve terlebih dahulu sebelum bisa dibayar.',
            { invoiceId: 'inv-emergency' },
            'INVOICE_DRAFT',
        );
        vi.mocked(InvoiceService.updateStatus).mockRejectedValue(draftError);

        const { updateInvoiceStatus } = await import('../invoice');

        // Act
        const result = await updateInvoiceStatus({
            id: '22222222-2222-4222-8222-222222222222',
            status: 'UNPAID' as any,
        });

        // Assert: safeAction returns { success: false, error: original message } — NOT generic
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe(
                'Invoice masih DRAFT. Finance harus approve terlebih dahulu sebelum bisa dibayar.',
            );
            expect(result.error).not.toBe('Failed to update invoice. Please try again.');
            expect((result as any).code).toBe('INVOICE_DRAFT');
        }
        expect(InvoiceService.updateStatus).toHaveBeenCalled();
    });

    it('should forward original BusinessRuleError for other business rule failures too', async () => {
        // Arrange
        const otherError = new BusinessRuleError('Some other rule violated', {}, 'SOME_RULE');
        vi.mocked(InvoiceService.updateStatus).mockRejectedValue(otherError);

        const { updateInvoiceStatus } = await import('../invoice');

        // Act
        const result = await updateInvoiceStatus({
            id: '33333333-3333-4333-8333-333333333333',
            status: 'PAID' as any,
        });

        // Assert
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe('Some other rule violated');
            expect(result.error).not.toBe('Failed to update invoice. Please try again.');
        }
    });

    it('should succeed when InvoiceService.updateStatus succeeds (STANDARD invoice confirm)', async () => {
        // Arrange
        vi.mocked(InvoiceService.updateStatus).mockResolvedValue({} as any);

        const { updateInvoiceStatus } = await import('../invoice');

        // Act
        const result = await updateInvoiceStatus({
            id: '44444444-4444-4444-8444-444444444444',
            status: 'UNPAID' as any,
        });

        // Assert
        expect(result.success).toBe(true);
    });
});

describe('updateSalesInvoiceDueDate action', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(requireFinanceMutation).mockResolvedValue({
            user: { id: AUTH_MOCK_ID },
        } as any);
    });

    it('parses Date from string, calls InvoiceService.updateSalesInvoiceDueDate with correct params, and returns success', async () => {
        const updatedInvoice = {
            id: 'inv-1',
            invoiceNumber: 'INV/2026/0001',
            dueDate: new Date('2026-09-01'),
            termOfPaymentDays: 30,
        };
        vi.mocked(InvoiceService.updateSalesInvoiceDueDate).mockResolvedValue(
            updatedInvoice as any,
        );

        const { revalidatePath } = await import('next/cache');
        const { updateSalesInvoiceDueDate } = await import('../invoice');

        const result = await updateSalesInvoiceDueDate(
            'inv-1',
            {
                dueDate: '2026-09-01',
                termOfPaymentDays: 30,
                invoiceDate: '2026-08-01',
            },
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect((result.data as any).id).toBe('inv-1');
        }

        // Verify service called with Date objects (parsed from string)
        expect(InvoiceService.updateSalesInvoiceDueDate).toHaveBeenCalledWith(
            'inv-1',
            {
                dueDate: expect.any(Date),
                termOfPaymentDays: 30,
                invoiceDate: expect.any(Date),
            },
            AUTH_MOCK_ID,
        );

        const callArgs = vi.mocked(InvoiceService.updateSalesInvoiceDueDate)
            .mock.calls[0]?.[1] as any;
        expect(callArgs.dueDate.toISOString().slice(0, 10)).toBe('2026-09-01');
        expect(callArgs.invoiceDate.toISOString().slice(0, 10)).toBe('2026-08-01');

        // revalidatePath called 3 times
        expect(revalidatePath).toHaveBeenCalledWith('/finance/invoices/sales');
        expect(revalidatePath).toHaveBeenCalledWith(
            '/finance/invoices/sales/inv-1',
        );
        expect(revalidatePath).toHaveBeenCalledWith('/sales/orders');
    });

    it('handles Date objects directly (not only strings)', async () => {
        const updatedInvoice = { id: 'inv-2', dueDate: new Date('2026-09-15') };
        vi.mocked(InvoiceService.updateSalesInvoiceDueDate).mockResolvedValue(
            updatedInvoice as any,
        );

        const { updateSalesInvoiceDueDate } = await import('../invoice');

        const result = await updateSalesInvoiceDueDate('inv-2', {
            dueDate: new Date('2026-09-15'),
            termOfPaymentDays: 14,
        });

        expect(result.success).toBe(true);
        expect(InvoiceService.updateSalesInvoiceDueDate).toHaveBeenCalledWith(
            'inv-2',
            {
                dueDate: expect.any(Date),
                termOfPaymentDays: 14,
                invoiceDate: undefined,
            },
            AUTH_MOCK_ID,
        );
    });

    it('returns success:false with error message when service throws BusinessRuleError (PAID/CANCELLED guard)', async () => {
        const guardError = new BusinessRuleError(
            'Tidak dapat mengubah tanggal jatuh tempo invoice yang sudah LUNAS atau DIBATALKAN',
        );
        vi.mocked(InvoiceService.updateSalesInvoiceDueDate).mockRejectedValue(
            guardError,
        );

        const { updateSalesInvoiceDueDate } = await import('../invoice');

        const result = await updateSalesInvoiceDueDate('inv-paid', {
            termOfPaymentDays: 30,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error).toBe(
                'Tidak dapat mengubah tanggal jatuh tempo invoice yang sudah LUNAS atau DIBATALKAN',
            );
        }
    });

    it('returns success:false when service throws generic error (safeAction generic message)', async () => {
        vi.mocked(InvoiceService.updateSalesInvoiceDueDate).mockRejectedValue(
            new Error('db down'),
        );

        const { updateSalesInvoiceDueDate } = await import('../invoice');

        const result = await updateSalesInvoiceDueDate('inv-3', {
            termOfPaymentDays: 7,
        });

        expect(result.success).toBe(false);
        // safeAction maps unknown Error to generic message
        if (!result.success) {
            expect(result.error).toBeDefined();
        }
    });

    it('supports partial payload (only termOfPaymentDays, no dueDate)', async () => {
        const updatedInvoice = {
            id: 'inv-4',
            dueDate: new Date('2026-08-15'),
            termOfPaymentDays: 60,
        };
        vi.mocked(InvoiceService.updateSalesInvoiceDueDate).mockResolvedValue(
            updatedInvoice as any,
        );

        const { updateSalesInvoiceDueDate } = await import('../invoice');

        const result = await updateSalesInvoiceDueDate('inv-4', {
            termOfPaymentDays: 60,
        });

        expect(result.success).toBe(true);
        expect(InvoiceService.updateSalesInvoiceDueDate).toHaveBeenCalledWith(
            'inv-4',
            {
                dueDate: undefined,
                termOfPaymentDays: 60,
                invoiceDate: undefined,
            },
            AUTH_MOCK_ID,
        );
    });
});
