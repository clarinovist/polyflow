import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateOrder } from '../orders-service';
import { prisma } from '@/lib/core/prisma';
import { SalesOrderStatus, SalesOrderType, Unit } from '@prisma/client';

/**
 * Regresi updateOrder pada SO yang sudah terkirim sebagian.
 *
 * Alur di dalam $transaction:
 *   1. deleteMany hanya menghapus item dengan deliveredQty === 0
 *   2. lalu `items: { create: itemsToCreate }` membuat ULANG SELURUH item payload
 *
 * Konsekuensi:
 *
 * (A) DUPLIKASI — baris dengan deliveredQty > 0 tidak dihapus di langkah 1,
 *     tapi tetap dibuat ulang di langkah 2. Padahal form WAJIB mengirim
 *     seluruh item (kalau tidak, item lain terhapus). Jadi setiap edit pada SO
 *     yang terkirim sebagian menggandakan baris yang sudah terkirim.
 *
 * (B) deliveredQty TERTUKAR — pemetaan payload→record lama memakai
 *     `find(di => di.productVariantId === item.productVariantId)`
 *     (orders-service.ts:616), yaitu by VARIAN bukan by id. Bila satu SO punya
 *     dua baris dengan varian sama, `find` selalu mengembalikan baris pertama,
 *     sehingga deliveredQty baris kedua jadi 0.
 *
 * Validasi di baris 527 sudah benar memakai `submittedItem.id` — jadi backend
 * memvalidasi by id tapi menyimpan by productVariantId. Tidak konsisten.
 *
 * Plan: docs/plan/2026-08-22-edit-item-so-sales-field.md
 */

const createMockPrisma = () => ({
    $queryRaw: vi.fn(),
    salesOrder: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: 'so-1', items: [] }),
    },
    salesOrderItem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 } as never),
        update: vi.fn().mockResolvedValue({} as never),
    },
    location: { findUnique: vi.fn() },
    productVariant: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn() },
    appSetting: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
});

const mockPrismaInstance = createMockPrisma();

vi.mock('@/lib/core/prisma', () => ({ getTenantDbFromContext: () => prisma,
    get prisma() {
        return {
            ...mockPrismaInstance,
            $transaction: vi.fn(async (cb: unknown) => {
                if (typeof cb === 'function') {
                    return (cb as (tx: unknown) => unknown)(mockPrismaInstance);
                }
                return cb;
            }),
        };
    },
}));

vi.mock('../credit-service', () => ({ checkCreditLimit: vi.fn() }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: vi.fn() }));
vi.mock('@/lib/modules/tenant-entitlements', () => ({
    hasTenantModule: vi.fn().mockResolvedValue(true),
}));

const dec = (n: number) => ({ toNumber: () => n, toString: () => String(n) });

const line = (over: Record<string, unknown>) => ({
    productVariantId: 'pv-1',
    quantity: 1,
    unitPrice: 1000,
    discountPercent: 0,
    taxPercent: 0,
    dppOtherAmount: null,
    ppnMode: 'EXCLUDE',
    isFreeItem: false,
    ...over,
});

const basePayload = (items: unknown[]) =>
    ({
        id: 'so-1',
        customerId: 'cust-1',
        sourceLocationId: 'loc-1',
        orderDate: new Date('2026-08-22T00:00:00.000Z'),
        expectedDate: null,
        notes: '',
        shippingCost: 0,
        items,
    }) as never;

describe('updateOrder — SO terkirim sebagian', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPrismaInstance.salesOrder.update.mockResolvedValue({
            id: 'so-1',
            items: [],
        } as never);
        mockPrismaInstance.salesOrderItem.deleteMany.mockResolvedValue({
            count: 0,
        } as never);
        vi.mocked(prisma.productVariant.findUnique).mockResolvedValue({
            id: 'pv-1',
            name: 'Rafia Hitam',
            conversionFactor: dec(1),
            baseUnit: Unit.KG,
            product: { productType: 'FINISHED_GOOD', name: 'Rafia' },
        } as never);
        vi.mocked(prisma.location.findUnique).mockResolvedValue({
            id: 'loc-1',
            name: 'Gudang',
            locationType: 'INTERNAL',
        } as never);
    });

    it('blocks ordinary edits with an active SJ and changes to historical product identity', async () => {
        const order = {
            id: 'so-1', status: 'CONFIRMED', orderType: 'MAKE_TO_STOCK',
            invoices: [], deliveryOrders: [{ id: 'do', status: 'LOADING' }],
            items: [{ id: 'old', productVariantId: 'pv-1', quantity: dec(100), unitPrice: dec(1000), deliveredQty: dec(20) }],
        };
        vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue(order as never);
        await expect(updateOrder(basePayload([line({ id: 'old', quantity: 100 })]), 'user')).rejects.toThrow(/Revisi muatan/);
        order.deliveryOrders = [];
        await expect(updateOrder(basePayload([line({ id: 'old', productVariantId: 'replacement', quantity: 100 })]), 'user')).rejects.toThrow(/sudah dikirim/);
        expect(mockPrismaInstance.salesOrderItem.update).not.toHaveBeenCalled();
    });

    it('(A) tidak menggandakan baris yang sudah terkirim saat payload mengirim ulang baris itu', async () => {
        vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
            id: 'so-1',
            status: SalesOrderStatus.CONFIRMED,
            orderType: SalesOrderType.MAKE_TO_STOCK,
            customerId: 'cust-1',
            sourceLocationId: 'loc-1',
            priceStatus: null,
            items: [
                {
                    id: 'item-terkirim',
                    productVariantId: 'pv-1',
                    quantity: dec(10),
                    unitPrice: dec(1000),
                    deliveredQty: dec(4),
                },
            ],
            invoices: [],
            deliveryOrders: [],
        } as never);

        await updateOrder(
            basePayload([
                line({ id: 'item-terkirim', quantity: 10, unitPrice: 1000 }),
            ]),
            'user-1',
        );

        const deletedIds =
            (mockPrismaInstance.salesOrderItem.deleteMany.mock.calls[0]?.[0]
                ?.where?.id?.in as string[] | undefined) ?? [];
        const createdRows = (mockPrismaInstance.salesOrder.update.mock
            .calls[0][0].data.items?.create ?? []) as unknown[];

        // Baris terkirim dipertahankan (tidak dihapus) DAN tidak dibuat ulang —
        // SO harus tetap punya tepat 1 baris untuk item itu.
        const survivingRows = deletedIds.includes('item-terkirim') ? 0 : 1;
        const totalRowsAfter = survivingRows + createdRows.length;

        expect(totalRowsAfter).toBe(1);

        // Diperbarui in place, sehingga id item stabil (FK jadwal kirim aman).
        expect(mockPrismaInstance.salesOrderItem.update).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'item-terkirim' } }),
        );
    });

    it('(B) tidak menukar deliveredQty ketika dua baris memakai productVariantId sama', async () => {
        vi.mocked(prisma.salesOrder.findUnique).mockResolvedValue({
            id: 'so-1',
            status: SalesOrderStatus.CONFIRMED,
            orderType: SalesOrderType.MAKE_TO_STOCK,
            customerId: 'cust-1',
            sourceLocationId: 'loc-1',
            priceStatus: null,
            items: [
                {
                    id: 'item-a',
                    productVariantId: 'pv-1',
                    quantity: dec(2),
                    unitPrice: dec(1000),
                    deliveredQty: dec(0),
                },
                {
                    id: 'item-b',
                    productVariantId: 'pv-1',
                    quantity: dec(5),
                    unitPrice: dec(1000),
                    deliveredQty: dec(5),
                },
            ],
            invoices: [],
            deliveryOrders: [],
        } as never);

        await updateOrder(
            basePayload([
                line({ id: 'item-a', quantity: 2 }),
                line({ id: 'item-b', quantity: 5 }),
            ]),
            'user-1',
        );

        const updateCalls = mockPrismaInstance.salesOrderItem.update.mock
            .calls as Array<[{ where: { id: string }; data: Record<string, unknown> }]>;

        // item-b harus di-update sebagai item-b (qty 5), bukan tertukar dengan
        // item-a yang kebetulan memakai productVariantId sama.
        const callB = updateCalls.find((c) => c[0].where.id === 'item-b');
        const callA = updateCalls.find((c) => c[0].where.id === 'item-a');

        expect(Number(callB?.[0].data.quantity)).toBe(5);
        expect(Number(callA?.[0].data.quantity)).toBe(2);

        // deliveredQty tidak pernah ditulis ulang — tetap milik masing-masing baris.
        expect(callB?.[0].data).not.toHaveProperty('deliveredQty');
        expect(callA?.[0].data).not.toHaveProperty('deliveredQty');
    });
});
