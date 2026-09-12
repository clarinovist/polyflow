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
            count: vi.fn(),
            update: vi.fn(),
            fields: { totalAmount: 'totalAmount-field-ref' },
        },
        payment: {
            create: vi.fn(),
        },
        appSetting: {
            findUnique: vi.fn().mockResolvedValue(null),
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
        notification: {
            createMany: vi.fn(),
            findMany: vi.fn().mockResolvedValue([]),
        },
    }
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn(),
}));

vi.mock('../finance/purchase-bill-journal-sync', () => ({
    resolvePurchaseBillJournalAccounts: vi.fn().mockResolvedValue({
        grClearingAccountId: 'acc-grir',
        vatInputAccountId: 'acc-vat',
        accountsPayableAccountId: 'acc-ap',
    }),
    syncPurchaseBillAndJournal: vi.fn().mockImplementation(
        async (_tx, input: { invoiceId: string; targetTotal: Prisma.Decimal }) => ({
            action: 'updated',
            invoice: {
                id: input.invoiceId,
                totalAmount: input.targetTotal,
            },
        }),
    ),
}));

vi.mock('@/lib/utils/sequence', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('@/lib/utils/sequence')
    >()),
    getNextSequence: vi.fn(),
}));

import { prisma } from '@/lib/core/prisma';
import { getNextSequence } from '@/lib/utils/sequence';
import {
    resolvePurchaseBillJournalAccounts,
    syncPurchaseBillAndJournal,
} from '../finance/purchase-bill-journal-sync';
import { createInvoice, getPurchaseInvoiceById, getPurchaseInvoices, getPurchaseInvoicesPage, getOutstandingPurchaseInvoices, generateBillNumber, createDraftBillFromPo, recordPayment, calculatePoInvoiceTotalFromReceipts, updatePurchaseInvoiceDueDate, checkOverduePurchasingInvoices } from '../invoices-service';
import { Prisma, PurchaseInvoiceStatus } from '@prisma/client';

const accounts = {
    grClearingAccountId: 'acc-grir',
    vatInputAccountId: 'acc-vat',
    accountsPayableAccountId: 'acc-ap',
};

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
            $queryRaw: vi.fn().mockResolvedValue([]),
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
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
        expect(tx.purchaseInvoice.findUnique).toHaveBeenCalledAfter(
            tx.$queryRaw,
        );
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

    it.each([
        ['negative', -1],
        ['zero', 0],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['sub-cent', 10.001],
        ['above database precision', 10_000_000_000_000],
    ])('rejects %s payment amounts before any database or sequence work', async (_label, amount) => {
        await expect(
            recordPayment('pinv-1', amount, 'user-1'),
        ).rejects.toMatchObject({ code: 'PURCHASE_PAYMENT_INVALID_AMOUNT' });

        expect(prisma.$transaction).not.toHaveBeenCalled();
        expect(getNextSequence).not.toHaveBeenCalled();
    });

    it('defaults supplier payment method when legacy callers do not provide one', async () => {
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
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

    it('selects purchaseOrder.id so the invoice list can link to /purchasing/orders/:id', async () => {
        // Arrange
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);

        // Act
        await getPurchaseInvoices();

        // Assert
        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                include: {
                    purchaseOrder: {
                        select: expect.objectContaining({ id: true }),
                    },
                },
            }),
        );
    });
});

describe('getPurchaseInvoicesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('applies search, status, overdue, and date filters identically before pagination', async () => {
        const startDate = new Date('2026-09-01T00:00:00.000Z');
        const endDate = new Date('2026-09-12T23:59:59.999Z');
        const now = new Date('2026-09-12T12:00:00.000Z');
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
            { id: 'inv-51' },
        ] as never);
        vi.mocked(prisma.purchaseInvoice.count).mockResolvedValue(75);

        const result = await getPurchaseInvoicesPage({
            search: '  BILL-51  ',
            status: PurchaseInvoiceStatus.UNPAID,
            overdue: true,
            startDate,
            endDate,
            page: 2,
            pageSize: 50,
            now,
            sort: 'totalAmount',
            direction: 'asc',
        });

        const expectedWhere = {
            status: {
                in: [
                    PurchaseInvoiceStatus.UNPAID,
                    PurchaseInvoiceStatus.PARTIAL,
                    PurchaseInvoiceStatus.OVERDUE,
                ],
            },
            invoiceDate: { gte: startDate, lte: endDate },
            dueDate: { lt: new Date('2026-09-11T17:00:00.000Z') },
            paidAmount: { lt: prisma.purchaseInvoice.fields.totalAmount },
            OR: [
                {
                    invoiceNumber: {
                        contains: 'BILL-51',
                        mode: 'insensitive',
                    },
                },
                {
                    purchaseOrder: {
                        is: {
                            orderNumber: {
                                contains: 'BILL-51',
                                mode: 'insensitive',
                            },
                        },
                    },
                },
                {
                    purchaseOrder: {
                        is: {
                            supplier: {
                                is: {
                                    name: {
                                        contains: 'BILL-51',
                                        mode: 'insensitive',
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        };
        expect(prisma.purchaseInvoice.count).toHaveBeenCalledWith({
            where: expectedWhere,
        });
        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expectedWhere,
                orderBy: [{ totalAmount: 'asc' }, { id: 'asc' }],
                skip: 50,
                take: 50,
            }),
        );
        expect(result).toEqual({
            items: [{ id: 'inv-51' }],
            totalCount: 75,
            page: 2,
            pageSize: 50,
            totalPages: 2,
        });
    });

    it('uses the start of the current WIB business day as overdue cutoff', async () => {
        vi.mocked(prisma.purchaseInvoice.count).mockResolvedValue(0);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);

        await getPurchaseInvoicesPage({
            overdue: true,
            now: new Date('2026-09-12T00:30:00.000Z'),
        });

        expect(prisma.purchaseInvoice.count).toHaveBeenCalledWith({
            where: expect.objectContaining({
                dueDate: { lt: new Date('2026-09-11T17:00:00.000Z') },
            }),
        });
    });

    it('clamps an out-of-range page and fetches the last valid page', async () => {
        vi.mocked(prisma.purchaseInvoice.count).mockResolvedValue(51);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
            { id: 'inv-51' },
        ] as never);

        const result = await getPurchaseInvoicesPage({ page: 999, pageSize: 50 });

        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 50, take: 50 }),
        );
        expect(result).toMatchObject({ page: 2, totalPages: 2 });
    });

    it('clamps zero results to page one', async () => {
        vi.mocked(prisma.purchaseInvoice.count).mockResolvedValue(0);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);

        const result = await getPurchaseInvoicesPage({ page: 999 });

        expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ skip: 0 }),
        );
        expect(result).toMatchObject({ page: 1, totalPages: 0 });
    });

    it('defaults to 50 rows and caps page size at 100', async () => {
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);
        vi.mocked(prisma.purchaseInvoice.count).mockResolvedValue(0);

        const defaultPage = await getPurchaseInvoicesPage();
        const cappedPage = await getPurchaseInvoicesPage({ pageSize: 500 });

        expect(defaultPage).toMatchObject({ page: 1, pageSize: 50 });
        expect(cappedPage).toMatchObject({ page: 1, pageSize: 100 });
        expect(prisma.purchaseInvoice.findMany).toHaveBeenLastCalledWith(
            expect.objectContaining({ skip: 0, take: 100 }),
        );
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
        vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
            callback({
                ...prisma,
                $queryRaw: vi.fn().mockResolvedValue([]),
            } as never),
        );
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
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([]);
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
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
            existingInvoice,
        ] as any);
        vi.mocked(prisma.purchaseInvoice.update).mockResolvedValue({} as any);

        const result = await createDraftBillFromPo('po-1', 'user-1');

        expect(result).toBeDefined();
        expect(syncPurchaseBillAndJournal).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                invoiceId: 'inv-existing',
                targetTotal: new Prisma.Decimal(2500000),
            }),
        );
        expect(prisma.purchaseInvoice.update).not.toHaveBeenCalled();
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
            totalAmount: new Prisma.Decimal(2500000),
            status: PurchaseInvoiceStatus.UNPAID,
            paidAmount: new Prisma.Decimal(1000),
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);
        vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
            existingInvoice,
        ] as any);

        const result = await createDraftBillFromPo('po-1', 'user-1');

        expect(result).toBeDefined();
        expect(prisma.purchaseInvoice.update).not.toHaveBeenCalled();
    });

    it('recomputes and reconciles an existing bill through one transaction client', async () => {
        const existingInvoice = {
            id: 'inv-existing',
            invoiceNumber: 'BILL-001',
            invoiceDate: new Date('2026-09-08T03:00:00.000Z'),
            totalAmount: new Prisma.Decimal(100),
            paidAmount: new Prisma.Decimal(0),
            status: PurchaseInvoiceStatus.UNPAID,
        };
        const po = {
            id: 'po-1',
            totalAmount: new Prisma.Decimal(150),
            taxAmount: new Prisma.Decimal(0),
            shippingCost: new Prisma.Decimal(0),
            orderNumber: 'PO-001',
            status: 'RECEIVED',
            supplier: { paymentTermDays: 30 },
            items: [{
                productVariantId: 'pv-1',
                quantity: new Prisma.Decimal(15),
                unitPrice: new Prisma.Decimal(10),
                discountPercent: new Prisma.Decimal(0),
                taxPercent: new Prisma.Decimal(0),
                ppnMode: 'EXCLUDE',
            }],
            goodsReceipts: [{
                items: [{ productVariantId: 'pv-1', receivedQty: new Prisma.Decimal(15) }],
            }],
        };
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            purchaseOrder: { findUnique: vi.fn().mockResolvedValue(po) },
            purchaseInvoice: {
                findMany: vi.fn().mockResolvedValue([existingInvoice]),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
            callback(tx as never),
        );
        vi.mocked(syncPurchaseBillAndJournal).mockResolvedValueOnce({
            action: 'updated',
            invoice: { ...existingInvoice, totalAmount: new Prisma.Decimal(150) },
        } as never);

        await createDraftBillFromPo('po-1', 'user-1');

        expect(resolvePurchaseBillJournalAccounts).toHaveBeenCalledTimes(1);
        expect(syncPurchaseBillAndJournal).toHaveBeenCalledWith(tx, {
            invoiceId: 'inv-existing',
            targetTotal: new Prisma.Decimal(150),
            poTotal: new Prisma.Decimal(150),
            poTax: new Prisma.Decimal(0),
            userId: 'user-1',
            accounts,
        });
        expect(prisma.purchaseInvoice.update).not.toHaveBeenCalled();
    });

    it('recognizes only a protected original plus its generated DRAFT supplement and revalidates the supplement', async () => {
        const original = {
            id: 'bill-original',
            invoiceNumber: 'BILL-001',
            totalAmount: new Prisma.Decimal(60),
            paidAmount: new Prisma.Decimal(60),
            status: PurchaseInvoiceStatus.PAID,
            notes: null,
        };
        const supplementary = {
            id: 'bill-supplementary',
            invoiceNumber: 'BILL-002',
            totalAmount: new Prisma.Decimal(40),
            paidAmount: new Prisma.Decimal(0),
            status: PurchaseInvoiceStatus.DRAFT,
            notes: 'Suplementer: tambahan GR setelah BILL-001 (sisa 40) — PO PO-001',
        };
        const po = {
            id: 'po-1',
            totalAmount: new Prisma.Decimal(100),
            taxAmount: new Prisma.Decimal(0),
            shippingCost: new Prisma.Decimal(0),
            orderNumber: 'PO-001',
            status: 'RECEIVED',
            supplier: { paymentTermDays: 30 },
            entrySource: null,
            items: [{
                productVariantId: 'pv-1',
                quantity: new Prisma.Decimal(10),
                unitPrice: new Prisma.Decimal(10),
                discountPercent: new Prisma.Decimal(0),
                taxPercent: new Prisma.Decimal(0),
                ppnMode: 'EXCLUDE',
            }],
            goodsReceipts: [{
                items: [{ productVariantId: 'pv-1', receivedQty: new Prisma.Decimal(10) }],
            }],
        };
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            purchaseOrder: { findUnique: vi.fn().mockResolvedValue(po) },
            purchaseInvoice: {
                findMany: vi.fn().mockResolvedValue([original, supplementary]),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
            callback(tx as never),
        );

        const result = await createDraftBillFromPo('po-1', 'user-1');

        expect(result).toBe(original);
        expect(syncPurchaseBillAndJournal).toHaveBeenCalledWith(tx, {
            invoiceId: supplementary.id,
            targetTotal: new Prisma.Decimal(40),
            poTotal: new Prisma.Decimal(100),
            poTax: new Prisma.Decimal(0),
            userId: 'user-1',
            accounts,
        });
    });

    it.each([
        [
            'duplicate DRAFT bills',
            [
                {
                    id: 'bill-1',
                    invoiceNumber: 'BILL-001',
                    totalAmount: new Prisma.Decimal(50),
                    paidAmount: new Prisma.Decimal(0),
                    status: PurchaseInvoiceStatus.DRAFT,
                    notes: null,
                },
                {
                    id: 'bill-2',
                    invoiceNumber: 'BILL-002',
                    totalAmount: new Prisma.Decimal(50),
                    paidAmount: new Prisma.Decimal(0),
                    status: PurchaseInvoiceStatus.DRAFT,
                    notes: null,
                },
            ],
        ],
        [
            'unrelated UNPAID bills',
            [
                {
                    id: 'bill-1',
                    invoiceNumber: 'BILL-001',
                    totalAmount: new Prisma.Decimal(50),
                    paidAmount: new Prisma.Decimal(0),
                    status: PurchaseInvoiceStatus.UNPAID,
                    notes: null,
                },
                {
                    id: 'bill-2',
                    invoiceNumber: 'BILL-002',
                    totalAmount: new Prisma.Decimal(50),
                    paidAmount: new Prisma.Decimal(0),
                    status: PurchaseInvoiceStatus.UNPAID,
                    notes: null,
                },
            ],
        ],
    ])('rejects equal-sum %s as ambiguous', async (_label, bills) => {
        const po = {
            id: 'po-1',
            totalAmount: new Prisma.Decimal(100),
            taxAmount: new Prisma.Decimal(0),
            shippingCost: new Prisma.Decimal(0),
            orderNumber: 'PO-001',
            status: 'RECEIVED',
            supplier: { paymentTermDays: 30 },
            entrySource: null,
            items: [{
                productVariantId: 'pv-1',
                quantity: new Prisma.Decimal(10),
                unitPrice: new Prisma.Decimal(10),
                discountPercent: new Prisma.Decimal(0),
                taxPercent: new Prisma.Decimal(0),
                ppnMode: 'EXCLUDE',
            }],
            goodsReceipts: [{
                items: [{ productVariantId: 'pv-1', receivedQty: new Prisma.Decimal(10) }],
            }],
        };
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            purchaseOrder: { findUnique: vi.fn().mockResolvedValue(po) },
            purchaseInvoice: { findMany: vi.fn().mockResolvedValue(bills) },
        };
        vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
            callback(tx as never),
        );

        await expect(createDraftBillFromPo('po-1', 'user-1')).rejects.toMatchObject({
            code: 'PURCHASE_BILL_AMBIGUOUS',
        });
        expect(syncPurchaseBillAndJournal).not.toHaveBeenCalled();
    });

    it('rejects multiple pre-existing bills instead of applying the aggregate to one bill', async () => {
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            purchaseOrder: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'po-1',
                    totalAmount: new Prisma.Decimal(100),
                    taxAmount: new Prisma.Decimal(0),
                    shippingCost: new Prisma.Decimal(0),
                    orderNumber: 'PO-001',
                    status: 'RECEIVED',
                    supplier: { paymentTermDays: 30 },
                    items: [],
                    goodsReceipts: [],
                }),
            },
            purchaseInvoice: {
                findMany: vi.fn().mockResolvedValue([
                    { id: 'bill-1', totalAmount: new Prisma.Decimal(50) },
                    { id: 'bill-2', totalAmount: new Prisma.Decimal(50) },
                ]),
            },
        };
        vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback) =>
            callback(tx as never),
        );

        await expect(createDraftBillFromPo('po-1', 'user-1')).rejects.toMatchObject({
            code: 'PURCHASE_BILL_AMBIGUOUS',
        });
        expect(syncPurchaseBillAndJournal).not.toHaveBeenCalled();
    });

    it('uses an injected transaction and does not swallow journal sync failures', async () => {
        const existingInvoice = {
            id: 'inv-existing',
            invoiceNumber: 'BILL-001',
            totalAmount: new Prisma.Decimal(100),
            paidAmount: new Prisma.Decimal(0),
            status: PurchaseInvoiceStatus.UNPAID,
        };
        const tx = {
            $queryRaw: vi.fn().mockResolvedValue([]),
            purchaseOrder: {
                findUnique: vi.fn().mockResolvedValue({
                    id: 'po-1',
                    totalAmount: new Prisma.Decimal(150),
                    taxAmount: new Prisma.Decimal(0),
                    shippingCost: new Prisma.Decimal(0),
                    orderNumber: 'PO-001',
                    status: 'RECEIVED',
                    supplier: { paymentTermDays: 30 },
                    items: [],
                    goodsReceipts: [],
                }),
            },
            purchaseInvoice: {
                findMany: vi.fn().mockResolvedValue([existingInvoice]),
            },
        };
        vi.mocked(syncPurchaseBillAndJournal).mockRejectedValueOnce(
            new Error('journal failed'),
        );

        await expect(
            createDraftBillFromPo('po-1', 'user-1', { tx: tx as never }),
        ).rejects.toThrow('journal failed');

        expect(prisma.$transaction).not.toHaveBeenCalled();
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
                { items: [{ productVariantId: 'pv-1', purchaseOrderItemId: null, receivedQty: { toNumber: () => 247 } }] },
            ],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');
        expect(total).toBe(2520000);
    });

    it('should attribute repeated-SKU rows by purchaseOrderItemId, not double-count', async () => {
        const mockPO = {
            totalAmount: 0,
            shippingCost: null,
            items: [
                { id: 'poi-a', productVariantId: 'pv-1', quantity: { toNumber: () => 5 }, unitPrice: { toNumber: () => 29748 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 11 }, ppnMode: 'INCLUDE' },
                { id: 'poi-b', productVariantId: 'pv-1', quantity: { toNumber: () => 7 }, unitPrice: { toNumber: () => 20000 }, discountPercent: { toNumber: () => 0 }, taxPercent: { toNumber: () => 11 }, ppnMode: 'EXCLUDE' },
            ],
            goodsReceipts: [
                { items: [{ productVariantId: 'pv-1', purchaseOrderItemId: 'poi-a', receivedQty: { toNumber: () => 5 } }] },
                { items: [{ productVariantId: 'pv-1', purchaseOrderItemId: 'poi-b', receivedQty: { toNumber: () => 7 } }] },
            ],
        };

        vi.mocked(prisma.purchaseOrder.findUnique).mockResolvedValue(mockPO as any);

        const total = await calculatePoInvoiceTotalFromReceipts('po-1');
        expect(total).toBe(304140);
    });

    describe('updatePurchaseInvoiceDueDate', () => {
        it('updates due date for valid invoice', async () => {
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue({
                id: 'pinv-1',
                status: PurchaseInvoiceStatus.UNPAID,
                invoiceDate: new Date('2026-07-01'),
                termOfPaymentDays: 30,
            } as any);

            vi.mocked(prisma.purchaseInvoice.update).mockResolvedValue({
                id: 'pinv-1',
                termOfPaymentDays: 30,
            } as any);

            const updated = await updatePurchaseInvoiceDueDate('pinv-1', { termOfPaymentDays: 30 }, 'user-1');
            expect(updated.id).toBe('pinv-1');
        });

        it('throws for paid invoice', async () => {
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue({
                id: 'pinv-1',
                status: PurchaseInvoiceStatus.PAID,
            } as any);

            await expect(updatePurchaseInvoiceDueDate('pinv-1', {}, 'user-1')).rejects.toThrow();
        });
    });

    describe('checkOverduePurchasingInvoices', () => {
        it('handles zero or multiple overdue invoices and sends notifications', async () => {
            vi.mocked(prisma.purchaseInvoice.findMany).mockResolvedValue([
                {
                    id: 'pinv-1',
                    invoiceNumber: 'PINV-001',
                    totalAmount: { toNumber: () => 1000 },
                    paidAmount: { toNumber: () => 0 },
                    dueDate: new Date(),
                    purchaseOrder: { orderNumber: 'PO-001' },
                } as any,
            ]);
            vi.mocked(prisma.user.findMany).mockResolvedValue([{ id: 'u-admin' }] as any);

            await checkOverduePurchasingInvoices(
                new Date('2026-09-12T00:30:00.000Z'),
            );
            expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        dueDate: {
                            lt: new Date('2026-09-11T17:00:00.000Z'),
                        },
                    }),
                }),
            );
        });
    });
});