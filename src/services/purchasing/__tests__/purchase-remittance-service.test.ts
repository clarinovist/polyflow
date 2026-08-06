import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        purchaseRemittance: {
            findFirst: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        purchaseRemittanceItem: {
            update: vi.fn(),
        },
        purchaseInvoice: {
            findUnique: vi.fn(),
        },
        purchasePayment: {
            findFirst: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        user: {
            findMany: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
            const { prisma: mockedPrisma } = await import('@/lib/core/prisma');
            const tx = {
                purchaseRemittance: {
                    create: (mockedPrisma as any).purchaseRemittance.create,
                },
                purchaseRemittanceItem: (mockedPrisma as any)
                    .purchaseRemittanceItem,
                purchaseInvoice: (mockedPrisma as any).purchaseInvoice,
            };
            return fn(tx);
        }),
    },
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/config/logger', () => ({
    logger: {
        warn: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
    },
}));

vi.mock('@/actions/finance/payment-mutation-actions', () => ({
    recordSupplierPayment: vi.fn().mockResolvedValue({
        success: true,
        data: { message: 'Payment recorded' },
    }),
}));

vi.mock('@/services/core/notification-service', () => ({
    NotificationService: {
        createBulkNotificationsThrottled: vi.fn().mockResolvedValue({ count: 0 }),
    },
}));

import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { NotificationService } from '@/services/core/notification-service';
import {
    generatePurchaseRemittanceNumber,
    createPurchaseRemittance,
    verifyPurchaseRemittance,
    rejectPurchaseRemittance,
} from '../purchase-remittance-service';

function dec(n: number) {
    return new Decimal(n);
}

function makeInvoiceRow(opts: {
    id: string;
    invoiceNumber?: string;
    totalAmount?: number;
    paidAmount?: number;
    status?: string;
}) {
    return {
        id: opts.id,
        invoiceNumber: opts.invoiceNumber ?? `PINV-${opts.id}`,
        totalAmount: dec(opts.totalAmount ?? 1000),
        paidAmount: dec(opts.paidAmount ?? 0),
        status: opts.status ?? 'UNPAID',
    };
}

describe('purchase-remittance-service', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('generatePurchaseRemittanceNumber', () => {
        it('format konsisten PREM-YYYY-MM-0001 ketika belum ada prefix', async () => {
            vi.mocked(prisma.purchaseRemittance.findFirst).mockResolvedValue(
                null as never,
            );

            const now = new Date('2026-08-02T00:00:00Z');
            const num = await generatePurchaseRemittanceNumber(now);

            expect(num).toBe('PREM-2026-08-0001');
        });

        it('increment dari nomor terakhir', async () => {
            vi.mocked(prisma.purchaseRemittance.findFirst).mockResolvedValue({
                remittanceNumber: 'PREM-2026-08-0005',
            } as never);

            const now = new Date('2026-08-02T00:00:00Z');
            const num = await generatePurchaseRemittanceNumber(now);
            expect(num).toBe('PREM-2026-08-0006');
        });
    });

    describe('createPurchaseRemittance', () => {
        function mockGenerateNumber() {
            vi.mocked(prisma.purchaseRemittance.findFirst).mockResolvedValue(
                null as never,
            );
        }

        it('tolak ketika total amount melebihi sisa tagihan invoice', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'pinv-1',
                    totalAmount: 1000,
                    paidAmount: 500,
                    status: 'UNPAID',
                }) as never,
            );

            await expect(
                createPurchaseRemittance({
                    userId: 'u1',
                    paidAt: new Date('2026-08-02T00:00:00Z'),
                    items: [
                        { purchaseInvoiceId: 'pinv-1', amount: 800, method: 'Cash' },
                    ],
                }),
            ).rejects.toThrow(/melebihi sisa tagihan/i);
        });

        it('tolak ketika invoice sudah PAID', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'pinv-paid',
                    totalAmount: 1000,
                    paidAmount: 1000,
                    status: 'PAID',
                }) as never,
            );

            await expect(
                createPurchaseRemittance({
                    userId: 'u1',
                    paidAt: new Date('2026-08-02T00:00:00Z'),
                    items: [
                        {
                            purchaseInvoiceId: 'pinv-paid',
                            amount: 100,
                            method: 'Transfer',
                        },
                    ],
                }),
            ).rejects.toThrow(/sudah PAID/i);
        });

        it('tolak ketika invoice sudah CANCELLED', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'pinv-cancel',
                    totalAmount: 1000,
                    paidAmount: 0,
                    status: 'CANCELLED',
                }) as never,
            );

            await expect(
                createPurchaseRemittance({
                    userId: 'u1',
                    paidAt: new Date('2026-08-02T00:00:00Z'),
                    items: [
                        {
                            purchaseInvoiceId: 'pinv-cancel',
                            amount: 100,
                            method: 'Cash',
                        },
                    ],
                }),
            ).rejects.toThrow(/CANCELLED/i);
        });

        it('tolak ketika invoice masih DRAFT (finance belum approve)', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'pinv-draft',
                    totalAmount: 1000,
                    paidAmount: 0,
                    status: 'DRAFT',
                }) as never,
            );

            await expect(
                createPurchaseRemittance({
                    userId: 'u1',
                    paidAt: new Date('2026-08-02T00:00:00Z'),
                    items: [
                        {
                            purchaseInvoiceId: 'pinv-draft',
                            amount: 100,
                            method: 'Cash',
                        },
                    ],
                }),
            ).rejects.toThrow(/DRAFT/i);
        });

        it('membuat PurchaseRemittance + item dalam satu $transaction (status PENDING) dengan field proof', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'pinv-1',
                    totalAmount: 1000,
                    paidAmount: 0,
                }) as never,
            );
            vi.mocked(prisma.purchaseRemittance.create).mockResolvedValue({
                id: 'prem-1',
                remittanceNumber: 'PREM-2026-08-0001',
                status: 'PENDING',
                totalAmount: dec(200),
                items: [
                    { id: 'pri-1', purchaseInvoiceId: 'pinv-1', amount: dec(200) },
                ],
            } as never);

            const res = await createPurchaseRemittance({
                userId: 'u1',
                paidAt: new Date('2026-08-02T00:00:00Z'),
                items: [
                    {
                        purchaseInvoiceId: 'pinv-1',
                        amount: 200,
                        method: 'Transfer',
                        referenceNumber: 'REF-1',
                        proofUrl: '/api/images/tenant/remittance-proof/u1/1.jpg',
                        proofStorageKey: 'tenant/remittance-proof/u1/1.jpg',
                        proofOriginalName: 'kwitansi.jpg',
                        proofMimeType: 'image/jpeg',
                        proofSizeBytes: 5555,
                    },
                ],
                notes: 'bayar COD',
            });

            expect(res).toBeDefined();
            expect(prisma.$transaction).toHaveBeenCalled();
            expect(prisma.purchaseRemittance.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: 'PENDING',
                        items: {
                            create: [
                                expect.objectContaining({
                                    proofUrl:
                                        '/api/images/tenant/remittance-proof/u1/1.jpg',
                                    proofOriginalName: 'kwitansi.jpg',
                                }),
                            ],
                        },
                    }),
                }),
            );
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'PURCHASE_REMITTANCE_CREATED',
                }),
            );
        });

        it('notifikasi FINANCE dikirim setelah remittance dibuat', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.purchaseInvoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'pinv-1',
                    totalAmount: 1000,
                    paidAmount: 0,
                }) as never,
            );
            vi.mocked(prisma.purchaseRemittance.create).mockResolvedValue({
                id: 'prem-1',
                remittanceNumber: 'PREM-2026-08-0001',
                status: 'PENDING',
                totalAmount: dec(200),
                items: [
                    { id: 'pri-1', purchaseInvoiceId: 'pinv-1', amount: dec(200) },
                ],
            } as never);
            vi.mocked(prisma.user.findMany).mockResolvedValue([
                { id: 'fin-1' },
            ] as never);

            await createPurchaseRemittance({
                userId: 'u1',
                paidAt: new Date('2026-08-02T00:00:00Z'),
                items: [
                    { purchaseInvoiceId: 'pinv-1', amount: 200, method: 'Cash' },
                ],
            });

            expect(
                NotificationService.createBulkNotificationsThrottled,
            ).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        userId: 'fin-1',
                        type: 'REMITTANCE_PENDING',
                        entityType: 'PurchaseRemittance',
                        entityId: 'prem-1',
                    }),
                ]),
            );
        });
    });

    describe('verifyPurchaseRemittance', () => {
        it('tolak jika remittance sudah tidak PENDING (idempotent claim)', async () => {
            vi.mocked(prisma.purchaseRemittance.updateMany).mockResolvedValue({
                count: 0,
            } as never);

            await expect(
                verifyPurchaseRemittance('prem-1', 'fin-1'),
            ).rejects.toThrow(/sudah diverifikasi\/ditolak/i);
        });

        it('verifikasi sukses memanggil recordSupplierPayment per item dan attach paymentId', async () => {
            vi.mocked(prisma.purchaseRemittance.updateMany).mockResolvedValue({
                count: 1,
            } as never);
            vi.mocked(prisma.purchaseRemittance.findUnique).mockResolvedValue({
                id: 'prem-1',
                remittanceNumber: 'PREM-2026-08-0001',
                paidAt: new Date('2026-08-02'),
                notes: null,
                items: [
                    {
                        id: 'pri-1',
                        purchaseInvoiceId: 'pinv-1',
                        amount: dec(200),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                ],
            } as never);

            const recordPayment = vi.fn().mockResolvedValue({
                success: true,
                data: { message: 'ok' },
            });
            const findLatestPaymentId = vi.fn().mockResolvedValue('pp-1');

            const result = await verifyPurchaseRemittance('prem-1', 'fin-1', undefined, {
                recordPayment,
                findLatestPaymentId,
            });

            expect(recordPayment).toHaveBeenCalledWith(
                expect.objectContaining({
                    invoiceId: 'pinv-1',
                    amount: 200,
                    method: 'Cash',
                }),
            );
            expect(prisma.purchaseRemittanceItem.update).toHaveBeenCalledWith({
                where: { id: 'pri-1' },
                data: { paymentId: 'pp-1' },
            });
            expect(result.successCount).toBe(1);
            expect(result.failedCount).toBe(0);
        });

        it('item gagal tetap tercatat sebagai partial (successCount/failedCount terpisah)', async () => {
            vi.mocked(prisma.purchaseRemittance.updateMany).mockResolvedValue({
                count: 1,
            } as never);
            vi.mocked(prisma.purchaseRemittance.findUnique).mockResolvedValue({
                id: 'prem-1',
                remittanceNumber: 'PREM-2026-08-0001',
                paidAt: new Date('2026-08-02'),
                notes: null,
                items: [
                    {
                        id: 'pri-1',
                        purchaseInvoiceId: 'pinv-1',
                        amount: dec(200),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                ],
            } as never);

            const recordPayment = vi.fn().mockResolvedValue({
                success: false,
                error: 'invoice exceeds',
            });

            const result = await verifyPurchaseRemittance('prem-1', 'fin-1', undefined, {
                recordPayment,
            });

            expect(result.successCount).toBe(0);
            expect(result.failedCount).toBe(1);
            expect(result.items[0].success).toBe(false);
        });
    });

    describe('rejectPurchaseRemittance', () => {
        it('wajib ada reason', async () => {
            await expect(
                rejectPurchaseRemittance('prem-1', 'fin-1', ''),
            ).rejects.toThrow(/alasan penolakan/i);
        });

        it('reject sukses set status REJECTED', async () => {
            vi.mocked(prisma.purchaseRemittance.updateMany).mockResolvedValue({
                count: 1,
            } as never);
            vi.mocked(prisma.purchaseRemittance.findUnique).mockResolvedValue({
                id: 'prem-1',
                remittanceNumber: 'PREM-2026-08-0001',
            } as never);

            const res = await rejectPurchaseRemittance(
                'prem-1',
                'fin-1',
                'Bukti tidak jelas',
            );

            expect(res.id).toBe('prem-1');
            expect(prisma.purchaseRemittance.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'prem-1', status: 'PENDING' },
                    data: expect.objectContaining({ status: 'REJECTED' }),
                }),
            );
        });
    });
});
