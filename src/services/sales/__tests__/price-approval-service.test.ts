import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        salesOrder: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock('@/lib/tools/audit', () => ({
    logActivity: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { approvePrice, rejectPrice } from '../price-approval-service';

describe('price-approval-service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('approvePrice', () => {
        it('PENDING → PROVISIONAL sukses dan tulis logActivity with from/to', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-2026-0001',
                priceStatus: 'PENDING',
                status: 'DRAFT',
            } as never);
            vi.mocked(prisma.salesOrder.update).mockResolvedValue({
                id: 'so-1',
                priceStatus: 'PROVISIONAL',
            } as never);

            const result = await approvePrice('so-1', 'approver-1', 'ok');

            expect(result).toBeDefined();
            expect(prisma.salesOrder.update).toHaveBeenCalledWith({
                where: { id: 'so-1' },
                data: { priceStatus: 'PROVISIONAL' },
            });
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'approver-1',
                    action: 'PRICE_APPROVED',
                    entityType: 'SalesOrder',
                    entityId: 'so-1',
                    fromStatus: 'PENDING',
                    toStatus: 'PROVISIONAL',
                }),
            );
        });

        it('ditolak kalau priceStatus bukan PENDING (sudah PROVISIONAL)', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-2026-0001',
                priceStatus: 'PROVISIONAL',
                status: 'DRAFT',
            } as never);

            await expect(approvePrice('so-1', 'approver-1')).rejects.toThrow(
                /tidak bisa di-approve/i,
            );
            expect(prisma.salesOrder.update).not.toHaveBeenCalled();
            expect(logActivity).not.toHaveBeenCalled();
        });

        it('ditolak kalau sudah FINAL', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-2026-0001',
                priceStatus: 'FINAL',
                status: 'CONFIRMED',
            } as never);

            await expect(approvePrice('so-1', 'approver-1')).rejects.toThrow();
            expect(prisma.salesOrder.update).not.toHaveBeenCalled();
        });

        it('ditolak kalau priceStatus null (tidak ada harga menunggu)', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-2026-0001',
                priceStatus: null,
                status: 'DRAFT',
            } as never);

            await expect(approvePrice('so-1', 'approver-1')).rejects.toThrow();
        });

        it('throws NotFound kalau SO tidak ada', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null as never);
            await expect(approvePrice('missing', 'approver-1')).rejects.toThrow();
        });
    });

    describe('rejectPrice', () => {
        it('tetap PENDING, tidak ubah status, catat log REJECTED dengan notes', async () => {
            vi.mocked(prisma.salesOrder.findUnique)
                .mockResolvedValueOnce({
                    id: 'so-1',
                    orderNumber: 'SO-2026-0001',
                    priceStatus: 'PENDING',
                    status: 'DRAFT',
                } as never)
                .mockResolvedValueOnce({
                    id: 'so-1',
                    orderNumber: 'SO-2026-0001',
                    priceStatus: 'PENDING',
                    status: 'DRAFT',
                } as never);

            const result = await rejectPrice(
                'so-1',
                'approver-1',
                'harga terlalu rendah',
            );

            expect(result).toBeDefined();
            // update should NOT be called (stays PENDING)
            expect(prisma.salesOrder.update).not.toHaveBeenCalled();
            expect(logActivity).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: 'approver-1',
                    action: 'PRICE_REJECTED',
                    fromStatus: 'PENDING',
                    toStatus: 'PENDING',
                    details: expect.stringContaining('harga terlalu rendah'),
                }),
            );
        });

        it('notes wajib diisi — kosong ditolak ValidationError', async () => {
            await expect(
                rejectPrice('so-1', 'approver-1', ''),
            ).rejects.toThrow(/Alasan penolakan harga wajib diisi/i);
            await expect(
                rejectPrice('so-1', 'approver-1', '   '),
            ).rejects.toThrow(/Alasan penolakan harga wajib diisi/i);
            await expect(
                rejectPrice('so-1', 'approver-1', undefined),
            ).rejects.toThrow(/Alasan penolakan harga wajib diisi/i);
            expect(prisma.salesOrder.findUnique).not.toHaveBeenCalled();
        });

        it('ditolak kalau bukan PENDING', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
                id: 'so-1',
                orderNumber: 'SO-2026-0001',
                priceStatus: 'PROVISIONAL',
                status: 'DRAFT',
            } as never);

            await expect(
                rejectPrice('so-1', 'approver-1', 'alasan'),
            ).rejects.toThrow(/tidak bisa ditolak/i);
            expect(logActivity).not.toHaveBeenCalled();
        });

        it('throws NotFound kalau SO tidak ada', async () => {
            vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(null as never);
            await expect(
                rejectPrice('missing', 'approver-1', 'alasan'),
            ).rejects.toThrow();
        });
    });
});
