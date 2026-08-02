import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Decimal } from '@prisma/client/runtime/library';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesRemittance: {
            findFirst: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
            update: vi.fn(),
            findMany: vi.fn(),
            findUnique: vi.fn(),
        },
        salesRemittanceItem: {
            update: vi.fn(),
        },
        invoice: {
            findUnique: vi.fn(),
        },
        payment: {
            findFirst: vi.fn(),
        },
        auditLog: {
            create: vi.fn(),
        },
        $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
            const { prisma: mockedPrisma } = await import('@/lib/core/prisma');
            const tx = {
                salesRemittance: {
                    create: (mockedPrisma as any).salesRemittance.create,
                },
                salesRemittanceItem: (mockedPrisma as any).salesRemittanceItem,
                invoice: (mockedPrisma as any).invoice,
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
    recordCustomerPayment: vi.fn().mockResolvedValue({
        success: true,
        data: { message: 'Payment recorded' },
    }),
}));

import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import {
    generateRemittanceNumber,
    createRemittance,
    verifyRemittance,
    rejectRemittance,
} from '../remittance-service';

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
        invoiceNumber: opts.invoiceNumber ?? `INV-${opts.id}`,
        totalAmount: dec(opts.totalAmount ?? 1000),
        paidAmount: dec(opts.paidAmount ?? 0),
        status: opts.status ?? 'UNPAID',
    };
}

describe('remittance-service', () => {
    beforeEach(() => vi.clearAllMocks());

    describe('generateRemittanceNumber', () => {
        it('format konsisten REM-YYYY-MM-0001 ketika belum ada prefix', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue(null as never);

            const now = new Date('2026-08-02T00:00:00Z');
            const num = await generateRemittanceNumber(now);

            expect(num).toBe('REM-2026-08-0001');
            expect(prisma.salesRemittance.findFirst).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { remittanceNumber: { startsWith: 'REM-2026-08-' } },
                }),
            );
        });

        it('increment dari nomor terakhir', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue({
                remittanceNumber: 'REM-2026-08-0005',
            } as never);

            const now = new Date('2026-08-02T00:00:00Z');
            const num = await generateRemittanceNumber(now);
            expect(num).toBe('REM-2026-08-0006');
        });

        it('reset counter per bulan (prefix berubah)', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue(null as never);
            const now = new Date('2026-09-01T00:00:00Z');
            const num = await generateRemittanceNumber(now);
            expect(num).toBe('REM-2026-09-0001');
        });

        it('format mengikuti pola orderNumber: prefix + counter padStart(4, 0)', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue({
                remittanceNumber: 'REM-2026-08-0099',
            } as never);
            const num = await generateRemittanceNumber(new Date('2026-08-15T00:00:00Z'));
            expect(num).toBe('REM-2026-08-0100');
            expect(num).toMatch(/^REM-\d{4}-\d{2}-\d{4}$/);
        });
    });

    describe('createRemittance', () => {
        function mockGenerateNumber() {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue(null as never);
        }

        it('tolak ketika total amount melebihi sisa tagihan invoice', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'inv-1',
                    totalAmount: 1000,
                    paidAmount: 500,
                    status: 'UNPAID',
                }) as never,
            );

            await expect(
                createRemittance({
                    userId: 'u1',
                    collectedAt: new Date('2026-08-02T00:00:00Z'),
                    items: [{ invoiceId: 'inv-1', amount: 800, method: 'Cash' }],
                }),
            ).rejects.toThrow(/melebihi sisa tagihan/i);
        });

        it('tolak ketika invoice sudah PAID', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'inv-paid',
                    totalAmount: 1000,
                    paidAmount: 1000,
                    status: 'PAID',
                }) as never,
            );

            await expect(
                createRemittance({
                    userId: 'u1',
                    collectedAt: new Date('2026-08-02T00:00:00Z'),
                    items: [{ invoiceId: 'inv-paid', amount: 100, method: 'Transfer' }],
                }),
            ).rejects.toThrow(/sudah PAID/i);
        });

        it('tolak ketika invoice sudah CANCELLED', async () => {
            mockGenerateNumber();
            vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
                makeInvoiceRow({
                    id: 'inv-cancel',
                    totalAmount: 1000,
                    paidAmount: 0,
                    status: 'CANCELLED',
                }) as never,
            );

            await expect(
                createRemittance({
                    userId: 'u1',
                    collectedAt: new Date('2026-08-02T00:00:00Z'),
                    items: [{ invoiceId: 'inv-cancel', amount: 100, method: 'Cash' }],
                }),
            ).rejects.toThrow(/CANCELLED/i);
        });

        it('validasi fresh per invoice (bukan cache lama)', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue(null as never);

            vi.mocked(prisma.invoice.findUnique).mockResolvedValueOnce(
                makeInvoiceRow({
                    id: 'inv-1',
                    totalAmount: 1000,
                    paidAmount: 500,
                    status: 'UNPAID',
                }) as never,
            );

            vi.mocked(prisma.salesRemittance.create).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                totalAmount: dec(500),
                items: [{ id: 'ri-1', invoiceId: 'inv-1', amount: dec(500) }],
            } as never);

            const ok = await createRemittance({
                userId: 'u1',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                items: [{ invoiceId: 'inv-1', amount: 500, method: 'Cash' }],
            });
            expect(ok).toBeDefined();

            vi.mocked(prisma.invoice.findUnique).mockResolvedValueOnce(
                makeInvoiceRow({
                    id: 'inv-1',
                    totalAmount: 1000,
                    paidAmount: 1000,
                    status: 'PAID',
                }) as never,
            );

            await expect(
                createRemittance({
                    userId: 'u1',
                    collectedAt: new Date('2026-08-02T00:00:00Z'),
                    items: [{ invoiceId: 'inv-1', amount: 100, method: 'Cash' }],
                }),
            ).rejects.toThrow(/PAID/i);

            expect(prisma.invoice.findUnique).toHaveBeenCalledTimes(2);
        });

        it('membuat SalesRemittance + SalesRemittanceItem dalam satu $transaction (status PENDING)', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue(null as never);
            vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
                makeInvoiceRow({ id: 'inv-1', totalAmount: 1000, paidAmount: 0 }) as never,
            );
            vi.mocked(prisma.salesRemittance.create).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                status: 'PENDING',
                totalAmount: dec(200),
                items: [{ id: 'ri-1', invoiceId: 'inv-1', amount: dec(200) }],
            } as never);

            const res = await createRemittance({
                userId: 'u1',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                items: [{ invoiceId: 'inv-1', amount: 200, method: 'Transfer', referenceNumber: 'REF-1' }],
                notes: 'setoran hari ini',
            });

            expect(res).toBeDefined();
            expect(prisma.$transaction).toHaveBeenCalled();
            expect(prisma.salesRemittance.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        status: 'PENDING',
                    }),
                }),
            );
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'SALES_REMITTANCE_CREATED',
                }),
            );
        });

        it('agregasi amount per invoiceId dalam validasi (dua item invoice sama)', async () => {
            vi.mocked(prisma.salesRemittance.findFirst).mockResolvedValue(null as never);
            vi.mocked(prisma.invoice.findUnique).mockResolvedValue(
                makeInvoiceRow({ id: 'inv-1', totalAmount: 1000, paidAmount: 700, status: 'UNPAID' }) as never,
            );

            await expect(
                createRemittance({
                    userId: 'u1',
                    collectedAt: new Date('2026-08-02T00:00:00Z'),
                    items: [
                        { invoiceId: 'inv-1', amount: 200, method: 'Cash' },
                        { invoiceId: 'inv-1', amount: 300, method: 'Cash' },
                    ],
                }),
            ).rejects.toThrow(/melebihi sisa tagihan/i);
        });
    });

    describe('verifyRemittance — CRITICAL: verifikasi ganda tidak membuat Payment dobel', () => {
        it('verifikasi dua kali TIDAK membuat Payment dobel — atomic claim via updateMany count', async () => {
            const mockRecordPayment = vi.fn().mockResolvedValue({
                success: true,
                data: { message: 'ok', paymentId: 'pay-1' },
            });
            const mockFindPayment = vi.fn().mockResolvedValue('pay-1');

            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValueOnce({ count: 1 } as never);
            vi.mocked(prisma.salesRemittance.findUnique).mockResolvedValueOnce({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                notes: null,
                items: [
                    {
                        id: 'ri-1',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-1',
                        amount: dec(500),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                ],
            } as never);
            vi.mocked(prisma.salesRemittanceItem.update).mockResolvedValue({} as never);

            const first = await verifyRemittance('rem-1', 'finance-1', undefined, {
                recordPayment: mockRecordPayment,
                findLatestPaymentId: mockFindPayment,
            });

            expect(first.successCount).toBe(1);
            expect(mockRecordPayment).toHaveBeenCalledTimes(1);

            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValueOnce({ count: 0 } as never);

            await expect(
                verifyRemittance('rem-1', 'finance-2', undefined, {
                    recordPayment: mockRecordPayment,
                    findLatestPaymentId: mockFindPayment,
                }),
            ).rejects.toThrow(/sudah diverifikasi\/ditolak sebelumnya/i);

            expect(mockRecordPayment).toHaveBeenCalledTimes(1);
        });

        it('skip item yang sudah punya paymentId — proteksi retry parsial', async () => {
            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValue({ count: 1 } as never);
            vi.mocked(prisma.salesRemittance.findUnique).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                notes: null,
                items: [
                    {
                        id: 'ri-already',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-old',
                        amount: dec(100),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: 'pay-existing',
                    },
                    {
                        id: 'ri-new',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-new',
                        amount: dec(200),
                        method: 'Transfer',
                        referenceNumber: null,
                        paymentId: null,
                    },
                ],
            } as never);

            const mockRecordPayment = vi.fn().mockResolvedValue({
                success: true,
                data: { paymentId: 'pay-new' },
            });
            vi.mocked(prisma.salesRemittanceItem.update).mockResolvedValue({} as never);

            const res = await verifyRemittance('rem-1', 'finance-1', undefined, {
                recordPayment: mockRecordPayment,
                findLatestPaymentId: async () => 'pay-new',
            });

            expect(mockRecordPayment).toHaveBeenCalledTimes(1);
            expect(mockRecordPayment).toHaveBeenCalledWith(
                expect.objectContaining({ invoiceId: 'inv-new' }),
            );
            expect(res.successCount).toBe(2);
        });

        it('kegagalan 1 item di tengah proses tidak membatalkan item lain yang sudah sukses (partial success)', async () => {
            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValue({ count: 1 } as never);
            vi.mocked(prisma.salesRemittance.findUnique).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                notes: null,
                items: [
                    {
                        id: 'ri-1',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-1',
                        amount: dec(100),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                    {
                        id: 'ri-2',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-2',
                        amount: dec(200),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                    {
                        id: 'ri-3',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-3',
                        amount: dec(300),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                ],
            } as never);

            const mockRecordPayment = vi
                .fn()
                .mockResolvedValueOnce({ success: true, data: { paymentId: 'pay-1' } })
                .mockResolvedValueOnce({ success: false, error: 'Invoice sudah lunas dari jalur lain' })
                .mockResolvedValueOnce({ success: true, data: { paymentId: 'pay-3' } });

            vi.mocked(prisma.salesRemittanceItem.update).mockResolvedValue({} as never);
            vi.mocked(prisma.salesRemittance.update).mockResolvedValue({} as never);

            const res = await verifyRemittance('rem-1', 'finance-1', undefined, {
                recordPayment: mockRecordPayment,
                findLatestPaymentId: async () => 'pay-latest',
            });

            expect(mockRecordPayment).toHaveBeenCalledTimes(3);
            expect(res.successCount).toBe(2);
            expect(res.failedCount).toBe(1);
            expect(res.items.filter((i) => i.success).length).toBe(2);
            expect(res.items.filter((i) => !i.success).length).toBe(1);
            expect(res.items.find((i) => i.invoiceId === 'inv-2')?.success).toBe(false);
            expect(prisma.salesRemittance.update).toHaveBeenCalled();
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'SALES_REMITTANCE_VERIFIED',
                    fromStatus: 'PENDING',
                    toStatus: 'VERIFIED',
                }),
            );
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'SALES_REMITTANCE_ITEM_FAILED',
                }),
            );
        });

        it('logActivity manual untuk SalesRemittance PENDING→VERIFIED (bukan andalkan withStatusAudit extension)', async () => {
            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValue({ count: 1 } as never);
            vi.mocked(prisma.salesRemittance.findUnique).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
                collectedAt: new Date('2026-08-02T00:00:00Z'),
                notes: null,
                items: [
                    {
                        id: 'ri-1',
                        remittanceId: 'rem-1',
                        invoiceId: 'inv-1',
                        amount: dec(100),
                        method: 'Cash',
                        referenceNumber: null,
                        paymentId: null,
                    },
                ],
            } as never);

            const mockRecordPayment = vi.fn().mockResolvedValue({
                success: true,
                data: { paymentId: 'pay-1' },
            });
            vi.mocked(prisma.salesRemittanceItem.update).mockResolvedValue({} as never);

            await verifyRemittance('rem-1', 'verifier-1', undefined, {
                recordPayment: mockRecordPayment,
                findLatestPaymentId: async () => 'pay-1',
            });

            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    entityType: 'SalesRemittance',
                    entityId: 'rem-1',
                    fromStatus: 'PENDING',
                    toStatus: 'VERIFIED',
                }),
            );
        });
    });

    describe('rejectRemittance', () => {
        it('reject tidak memanggil recordCustomerPayment sama sekali', async () => {
            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValue({ count: 1 } as never);
            vi.mocked(prisma.salesRemittance.findUnique).mockResolvedValue({
                id: 'rem-1',
                remittanceNumber: 'REM-2026-08-0001',
            } as never);

            const res = await rejectRemittance('rem-1', 'finance-1', 'Data tidak valid');

            expect(res).toBeDefined();
            expect(res.id).toBe('rem-1');
            expect(prisma.salesRemittance.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ id: 'rem-1', status: 'PENDING' }),
                    data: expect.objectContaining({ status: 'REJECTED' }),
                }),
            );
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: 'SALES_REMITTANCE_REJECTED',
                    fromStatus: 'PENDING',
                    toStatus: 'REJECTED',
                }),
            );
        });

        it('reason wajib diisi', async () => {
            await expect(rejectRemittance('rem-1', 'finance-1', '')).rejects.toThrow(/wajib diisi/i);
            await expect(rejectRemittance('rem-1', 'finance-1', '   ')).rejects.toThrow(/wajib diisi/i);
        });

        it('atomic conditional update — count 0 → throw already processed', async () => {
            vi.mocked(prisma.salesRemittance.updateMany).mockResolvedValue({ count: 0 } as never);
            await expect(rejectRemittance('rem-1', 'finance-1', 'Alasan')).rejects.toThrow(
                /sudah diverifikasi\/ditolak sebelumnya/i,
            );
        });
    });
});
