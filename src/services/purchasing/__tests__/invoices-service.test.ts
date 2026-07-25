import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseOrder: {
            findUnique: vi.fn(),
        },
        purchaseInvoice: {
            create: vi.fn(),
            findUnique: vi.fn(),
            findFirst: vi.fn(),
            findMany: vi.fn(),
            update: vi.fn(),
        },
        payment: {
            create: vi.fn(),
        },
        $transaction: vi.fn(async (callback) => callback({
            purchaseInvoice: {
                findUnique: vi.fn(),
                update: vi.fn(),
            },
            payment: {
                create: vi.fn(),
            },
        })),
        user: {
            findMany: vi.fn(),
        },
    }
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('@/lib/utils/sequence', () => ({
    getNextSequence: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { getNextSequence } from '@/lib/utils/sequence';
import { createInvoice, getPurchaseInvoiceById, getPurchaseInvoices, getOutstandingPurchaseInvoices, generateBillNumber, createDraftBillFromPo, recordPayment, calculatePoInvoiceTotalFromReceipts } from '../invoices-service';
import { PurchaseInvoiceStatus } from '@prisma/client';

// Mock auto-journal
vi.mock('../../finance/auto-journal-service', () => ({
    AutoJournalService: {
        handlePurchaseInvoiceCreated: vi.fn().mockResolvedValue(undefined),
    },
}));

// Mock logger
vi.mock('@/lib/config/logger', () => ({
    logger: {
        error: vi.fn(),
    },
}));

describe('Purchasing invoices service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('records purchase invoice payments in canonical Payment model', async () => {
        const tx = {
            purchaseInvoice: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    invoiceNumber: 'BILL-001',
                    paidAmount: { toNumber: () => 100000 },
                    totalAmount: { toNumber: () => 300000 },
                }),
                update: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    paidAmount: 175000,
                    status: 'PARTIAL',
                }),
            },
            payment: {
                create: vi.fn().mockResolvedValue({
                    id: 'pay-1',
                    paymentNumber: 'PAY-OUT-001',
                }),
            },
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
        vi.mocked(getNextSequence).mockResolvedValue('PAY-OUT-001');

        const result = await recordPayment('pinv-1', 75000, 'user-1', {
            paymentDate: new Date('2026-04-20T10:00:00.000Z'),
            method: 'Cash',
            notes: 'Supplier settlement',
        });

        expect(getNextSequence).toHaveBeenCalledWith('PAYMENT_OUT');
        expect(tx.payment.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                purchaseInvoiceId: 'pinv-1',
                paymentNumber: 'PAY-OUT-001',
                amount: 75000,
                method: 'Cash',
                notes: 'Supplier settlement',
            })
        });
        expect(result).toEqual(expect.objectContaining({ paymentId: 'pay-1' }));
    });

    it('defaults supplier payment method when legacy callers do not provide one', async () => {
        const tx = {
            purchaseInvoice: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    invoiceNumber: 'BILL-001',
                    paidAmount: { toNumber: () => 100000 },
                    totalAmount: { toNumber: () => 300000 },
                }),
                update: vi.fn().mockResolvedValue({
                    id: 'pinv-1',
                    paidAmount: 150000,
                    status: 'PARTIAL',
                }),
            },
            payment: {
                create: vi.fn().mockResolvedValue({
                    id: 'pay-2',
                    paymentNumber: 'PAY-OUT-002',
                }),
            },
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));
        vi.mocked(getNextSequence).mockResolvedValue('PAY-OUT-002');

        await recordPayment('pinv-1', 50000, 'user-1');

        expect(tx.payment.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                purchaseInvoiceId: 'pinv-1',
                paymentNumber: 'PAY-OUT-002',
                amount: 50000,
                method: 'Transfer BCA',
                destinationBank: 'BCA',
            })
        });
    });

    it('loads purchase invoice history from canonical payments relation', async () => {
        vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue({
            id: 'pinv-1',
            payments: [
                {
                    id: 'pay-1',
                    paymentNumber: 'PAY-OUT-001',
                    paymentDate: new Date('2026-04-20T10:00:00.000Z'),
                    amount: 75000,
                    method: 'Cash',
                }
            ]
        } as never);

        await getPurchaseInvoiceById('pinv-1');

        expect(prisma.purchaseInvoice.findUnique).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'pinv-1' },
            include: expect.objectContaining({
                payments: expect.objectContaining({
                    orderBy: { paymentDate: 'desc' }
                })
            })
        }));
    });
});

describe('createInvoice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create purchase invoice with GR-based total when GR exists', async () => {
        const mockPO = {
            id: 'po-1',
            totalAmount: 2500000,
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 247 } }] },
            ],
        };

        const mockInvoice = {
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            purchaseOrderId: 'po-1',
            totalAmount: 2470000,
            status: PurchaseInvoiceStatus.UNPAID,
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);
        vi.mocked(prisma.purchaseInvoice.create).mockResolvedValue(mockInvoice as any);

        const result = await createInvoice({
            purchaseOrderId: 'po-1',
            invoiceNumber: 'INV-001',
            invoiceDate: new Date(),
            termOfPaymentDays: 30,
            notes: '',
        });

        expect(result).toEqual(mockInvoice);
        const createCall = vi.mocked(prisma.purchaseInvoice.create).mock.calls[0][0];
        expect(createCall.data.totalAmount).toBe(2470000);
    });

    it('should fallback to PO totalAmount when no GR exists', async () => {
        const mockPO = {
            id: 'po-1',
            totalAmount: 2500000,
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [],
        };

        const mockInvoice = {
            id: 'inv-1',
            invoiceNumber: 'INV-001',
            purchaseOrderId: 'po-1',
            totalAmount: 2500000,
            status: PurchaseInvoiceStatus.UNPAID,
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);
        vi.mocked(prisma.purchaseInvoice.create).mockResolvedValue(mockInvoice as any);

        const result = await createInvoice({
            purchaseOrderId: 'po-1',
            invoiceNumber: 'INV-001',
            invoiceDate: new Date(),
            termOfPaymentDays: 30,
            notes: '',
        });

        expect(result).toEqual(mockInvoice);
        const createCall = vi.mocked(prisma.purchaseInvoice.create).mock.calls[0][0];
        expect(createCall.data.totalAmount).toBe(2500000);
    });

    it('should throw error when purchase order not found', async () => {
        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(null);

        await expect(createInvoice({
            purchaseOrderId: 'po-999',
            invoiceNumber: 'INV-001',
            invoiceDate: new Date(),
            termOfPaymentDays: 0,
            notes: '',
        })).rejects.toThrow(/tidak ditemukan/i);
    });
});

describe('getPurchaseInvoices', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return all purchase invoices', async () => {
        // Arrange
        const mockInvoices = [
            {
                id: 'inv-1',
                invoiceNumber: 'INV-001',
                purchaseOrder: {
                    orderNumber: 'PO-001',
                    supplier: { name: 'Supplier A' },
                },
            },
        ];

        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue(mockInvoices as any);

        // Act
        const result = await getPurchaseInvoices();

        // Assert
        expect(result).toEqual(mockInvoices);
    });

    it('should filter by date range when provided', async () => {
        // Arrange
        const startDate = new Date(2024, 0, 1);
        const endDate = new Date(2024, 0, 31);

        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);

        // Act
        await getPurchaseInvoices({ startDate, endDate });

        // Assert
        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith({
            where: {
                invoiceDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            include: expect.any(Object),
            orderBy: { createdAt: 'desc' },
        });
    });
});

describe('getOutstandingPurchaseInvoices', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('includes UNPAID, PARTIAL, OVERDUE, and DRAFT with remaining balance', async () => {
        const mockInvoices = [
            {
                id: 'unpaid',
                invoiceNumber: 'BILL-1',
                totalAmount: 100_000,
                paidAmount: 0,
                status: 'UNPAID',
                invoiceDate: new Date('2026-07-01'),
                purchaseOrder: { orderNumber: 'PO-1', supplier: { name: 'Fadila' } },
            },
            {
                id: 'partial',
                invoiceNumber: 'BILL-2',
                totalAmount: 200_000,
                paidAmount: 50_000,
                status: 'PARTIAL',
                invoiceDate: new Date('2026-07-02'),
                purchaseOrder: { orderNumber: 'PO-2', supplier: { name: 'Fadila' } },
            },
            {
                id: 'overdue',
                invoiceNumber: 'BILL-3',
                totalAmount: 80_000,
                paidAmount: 0,
                status: 'OVERDUE',
                invoiceDate: new Date('2026-06-01'),
                purchaseOrder: { orderNumber: 'PO-3', supplier: { name: 'Intera' } },
            },
            {
                id: 'draft-open',
                invoiceNumber: 'BILL-4',
                totalAmount: 30_000,
                paidAmount: 0,
                status: 'DRAFT',
                invoiceDate: new Date('2026-07-03'),
                purchaseOrder: { orderNumber: 'PO-4', supplier: { name: 'Solo' } },
            },
            {
                id: 'paid',
                invoiceNumber: 'BILL-5',
                totalAmount: 10_000,
                paidAmount: 10_000,
                status: 'PAID',
                invoiceDate: new Date('2026-05-01'),
                purchaseOrder: { orderNumber: 'PO-5', supplier: { name: 'Fadila' } },
            },
            {
                id: 'unpaid-but-settled',
                invoiceNumber: 'BILL-6',
                totalAmount: 15_000,
                paidAmount: 15_000,
                status: 'UNPAID',
                invoiceDate: new Date('2026-05-02'),
                purchaseOrder: { orderNumber: 'PO-6', supplier: { name: 'Fadila' } },
            },
            {
                id: 'decimal-partial',
                invoiceNumber: 'BILL-7',
                totalAmount: { toNumber: () => 4_786_248 },
                paidAmount: { toNumber: () => 1_000_000 },
                status: 'PARTIAL',
                invoiceDate: new Date('2026-07-04'),
                purchaseOrder: { orderNumber: 'PO-7', supplier: { name: 'Melindo' } },
            },
        ];

        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue(mockInvoices as any);

        const result = await getOutstandingPurchaseInvoices();

        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: { not: 'CANCELLED' } },
            }),
        );

        const ids = result.map((inv) => inv.id);
        expect(ids).toEqual(['unpaid', 'partial', 'overdue', 'draft-open', 'decimal-partial']);
        expect(ids).not.toContain('paid');
        expect(ids).not.toContain('unpaid-but-settled');
    });

    it('excludes CANCELLED at the query layer', async () => {
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);

        await getOutstandingPurchaseInvoices();

        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { status: { not: PurchaseInvoiceStatus.CANCELLED } },
            }),
        );
    });
});

describe('generateBillNumber', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should generate bill number with sequence 0001', async () => {
        // Arrange
        vi.mocked(prisma.purchaseInvoice.findFirst).mockResolvedValue(null);

        // Act
        const result = await generateBillNumber();

        // Assert
        expect(result).toMatch(/^BILL - \d{4} -0001/);
    });

    it('should increment sequence when last bill exists', async () => {
        // Arrange
        const year = new Date().getFullYear();
        vi.mocked(prisma.purchaseInvoice.findFirst).mockResolvedValue({
            invoiceNumber: `BILL - ${year} -0005`,
        } as any);

        // Act
        const result = await generateBillNumber();

        // Assert
        expect(result).toMatch(`BILL - ${year} -0006`);
    });
});

describe('createDraftBillFromPo', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should create draft bill using GR received qty (not PO qty)', async () => {
        const mockPO = {
            id: 'po-1',
            totalAmount: 2500000,
            orderNumber: 'PO-001',
            status: 'PARTIAL_RECEIVED',
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 247 } }] },
            ],
        };

        const mockInvoice = {
            id: 'inv-1',
            invoiceNumber: 'BILL-001',
            totalAmount: 2470000,
            status: PurchaseInvoiceStatus.UNPAID,
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);
        vi.mocked(prisma.purchaseInvoice.findFirst).mockResolvedValue(null);
        vi.mocked(prisma.purchaseInvoice.create).mockResolvedValue(mockInvoice as any);

        const result = await createDraftBillFromPo('po-1', 'user-1');

        expect(result).toBeDefined();
        const createCall = vi.mocked(prisma.purchaseInvoice.create).mock.calls[0][0];
        expect(createCall.data.totalAmount).toBe(2470000);
    });

    it('should update existing invoice total when GR qty changes', async () => {
        const mockPO = {
            id: 'po-1',
            totalAmount: 2500000,
            orderNumber: 'PO-001',
            status: 'RECEIVED',
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 250 } }] },
            ],
        };

        const existingInvoice = {
            id: 'inv-existing',
            invoiceNumber: 'BILL-001',
            totalAmount: { toNumber: () => 2470000 },
            status: PurchaseInvoiceStatus.UNPAID,
            paidAmount: { toNumber: () => 0 },
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);
        vi.mocked(prisma.purchaseInvoice.findFirst).mockResolvedValue(existingInvoice as any);
        vi.mocked(prisma.purchaseInvoice.update).mockResolvedValue({} as any);

        const result = await createDraftBillFromPo('po-1', 'user-1');

        expect(result).toBeDefined();
        expect(prisma.purchaseInvoice.update).toHaveBeenCalledWith({
            where: { id: 'inv-existing' },
            data: { totalAmount: 2500000 },
        });
    });

    it('should return undefined when purchase order not found', async () => {
        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(null);

        const result = await createDraftBillFromPo('po-999', 'user-1');

        expect(result).toBeUndefined();
    });

    it('should return existing invoice without update when GR total matches', async () => {
        const mockPO = {
            id: 'po-1',
            totalAmount: 2500000,
            orderNumber: 'PO-001',
            status: 'RECEIVED',
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 250 } }] },
            ],
        };

        const existingInvoice = {
            id: 'inv-existing',
            invoiceNumber: 'BILL-001',
            totalAmount: { toNumber: () => 2500000 },
            status: PurchaseInvoiceStatus.UNPAID,
            paidAmount: { toNumber: () => 1000 },
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);
        vi.mocked(prisma.purchaseInvoice.findFirst).mockResolvedValue(existingInvoice as any);

        const result = await createDraftBillFromPo('po-1', 'user-1');

        expect(result).toBeDefined();
        expect(prisma.purchaseInvoice.update).not.toHaveBeenCalled();
    });
});

describe('calculatePoInvoiceTotalFromReceipts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should calculate total from GR received qty with discount and PPN', async () => {
        const mockPO = {
            totalAmount: 1000000,
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 100 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 10 }, taxPercent: { toNumber: () => 11 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 90 } }] },
            ],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');

        expect(total).toBe(899100);
    });

    it('should aggregate multiple GRs', async () => {
        const mockPO = {
            totalAmount: 2500000,
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 100 } }] },
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 147 } }] },
            ],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');
        expect(total).toBe(2470000);
    });

    it('should handle over-receiving', async () => {
        const mockPO = {
            totalAmount: 2500000,
            shippingCost: null,
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 252 } }] },
            ],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');
        expect(total).toBe(2520000);
    });

    it('should fallback to PO totalAmount when no GR', async () => {
        const mockPO = {
            totalAmount: 2500000,
            shippingCost: null,
            items: [],
            goodsReceipts: [],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');
        expect(total).toBe(2500000);
    });

    it('should include flat shipping cost', async () => {
        const mockPO = {
            totalAmount: 2550000,
            shippingCost: { toNumber: () => 50000 },
            items: [
                { productVariantId: 'pv-1', quantity: { toNumber: () => 250 }, unitPrice: { toNumber: () => 10000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 0 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', receivedQty: { toNumber: () => 247 } }] },
            ],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');
        expect(total).toBe(2520000);
    });
});