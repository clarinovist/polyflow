
import { describe, it, expect, vi, beforeEach , Mock } from 'vitest';
import { InvoiceService } from '../finance/invoice-service';
import { prisma } from '@/lib/core/prisma';
import { AutoJournalService } from '../finance/auto-journal-service';
import { logger } from '@/lib/config/logger';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        invoice: {
            findFirst: vi.fn(),
            create: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
        },
        salesOrder: {
            findUnique: vi.fn(),
        },
        user: {
            findMany: vi.fn(),
        },
        journalEntry: {
            updateMany: vi.fn(),
        }
    }
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('../finance/auto-journal-service', () => ({
    AutoJournalService: {
        handleSalesInvoiceCreated: vi.fn(),
    }
}));

describe('InvoiceService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('createInvoice', () => {
        it('should handle AutoJournalService.handleSalesInvoiceCreated failure gracefully', async () => {
            // Mock generateInvoiceNumber internal logic
            (prisma.invoice.findFirst as Mock).mockResolvedValue(null);

            // Mock sales order
            (prisma.salesOrder.findUnique as Mock).mockResolvedValue({
                id: 'so-1',
                totalAmount: { toNumber: () => 1000 },
                orderNumber: 'SO-001'
            });

            // Mock created invoice
            (prisma.invoice.create as Mock).mockResolvedValue({
                id: 'inv-1',
                invoiceNumber: 'INV-20231010-0001',
            });

            const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

            const mockError = new Error('Journal generation failed');
            (AutoJournalService.handleSalesInvoiceCreated as Mock).mockRejectedValue(mockError);

            await InvoiceService.createInvoice({
                salesOrderId: 'so-1',
                invoiceDate: new Date(),
                dueDate: new Date(),
                termOfPaymentDays: 30,
            }, 'user-1');

            expect(AutoJournalService.handleSalesInvoiceCreated).toHaveBeenCalledWith('inv-1');
            expect(loggerErrorSpy).toHaveBeenCalledWith("Failed to generate auto-journal for invoice", expect.objectContaining({ error: mockError }));

            loggerErrorSpy.mockRestore();
        });
    });

    describe('createDraftInvoiceFromOrder', () => {
        it('should handle AutoJournalService.handleSalesInvoiceCreated failure gracefully', async () => {
            // Mock generateInvoiceNumber internal logic
            (prisma.invoice.findFirst as Mock).mockResolvedValueOnce(null); // existing check
            (prisma.invoice.findFirst as Mock).mockResolvedValueOnce(null); // generateInvoiceNumber check

            // Mock sales order
            (prisma.salesOrder.findUnique as Mock).mockResolvedValue({
                id: 'so-1',
                totalAmount: { toNumber: () => 1000 },
                orderNumber: 'SO-001'
            });

            // Mock created invoice
            (prisma.invoice.create as Mock).mockResolvedValue({
                id: 'inv-2',
                invoiceNumber: 'INV-20231010-0002',
            });

            const loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

            const mockError = new Error('Journal generation failed');
            (AutoJournalService.handleSalesInvoiceCreated as Mock).mockRejectedValue(mockError);

            await InvoiceService.createDraftInvoiceFromOrder('so-1', 'user-1');

            expect(AutoJournalService.handleSalesInvoiceCreated).toHaveBeenCalledWith('inv-2');
            expect(loggerErrorSpy).toHaveBeenCalledWith("Failed to generate auto-journal for invoice", expect.objectContaining({ error: mockError }));

            loggerErrorSpy.mockRestore();
        });
    });
});
