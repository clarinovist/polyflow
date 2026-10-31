import { describe, it, expect } from 'vitest';
import {
    aggregateReturnedQtyByVariant,
    getOrderItemStatus,
} from '../order-item-status';

describe('order-item-status', () => {
    it('menandai draft untuk fase pre-confirm tanpa pengiriman', () => {
        expect(
            getOrderItemStatus({
                orderStatus: 'DRAFT',
                quantity: 10,
                deliveredQty: 0,
            }).key,
        ).toBe('draft');
        expect(
            getOrderItemStatus({
                orderStatus: 'QUOTATION_SENT',
                quantity: 10,
                deliveredQty: 0,
            }).key,
        ).toBe('draft');
    });

    it('menandai dibatalkan untuk SO cancelled', () => {
        expect(
            getOrderItemStatus({
                orderStatus: 'CANCELLED',
                quantity: 10,
                deliveredQty: 6,
            }).key,
        ).toBe('cancelled');
    });

    it('menandai dalam produksi bila operasional tapi belum terkirim', () => {
        expect(
            getOrderItemStatus({
                orderStatus: 'CONFIRMED',
                quantity: 10,
                deliveredQty: 0,
            }).key,
        ).toBe('in_production');
        expect(
            getOrderItemStatus({
                orderStatus: 'IN_PRODUCTION',
                quantity: 10,
                deliveredQty: 0,
            }).key,
        ).toBe('in_production');
    });

    it('membedakan terkirim sebagian dan terkirim penuh', () => {
        expect(
            getOrderItemStatus({
                orderStatus: 'DELIVERED',
                quantity: 10,
                deliveredQty: 4,
            }).key,
        ).toBe('partial');
        expect(
            getOrderItemStatus({
                orderStatus: 'DELIVERED',
                quantity: 10,
                deliveredQty: 10,
            }).key,
        ).toBe('delivered');
    });

    it('mengutamakan status retur di atas status kirim', () => {
        expect(
            getOrderItemStatus({
                orderStatus: 'DELIVERED',
                quantity: 10,
                deliveredQty: 10,
                returnedQty: 10,
            }).key,
        ).toBe('returned_full');
        expect(
            getOrderItemStatus({
                orderStatus: 'DELIVERED',
                quantity: 10,
                deliveredQty: 10,
                returnedQty: 3,
            }).key,
        ).toBe('returned_partial');
    });

    it('membatasi retur maksimal sebesar yang terkirim', () => {
        const status = getOrderItemStatus({
            orderStatus: 'DELIVERED',
            quantity: 10,
            deliveredQty: 4,
            returnedQty: 99,
        });
        expect(status.key).toBe('returned_full');
        expect(status.returnedQty).toBe(4);
    });

    it('mengabaikan retur cancelled dan menjumlah per varian', () => {
        const map = aggregateReturnedQtyByVariant([
            {
                status: 'CANCELLED',
                items: [{ productVariantId: 'v1', returnedQty: 5 }],
            },
            {
                status: 'CONFIRMED',
                items: [
                    { productVariantId: 'v1', returnedQty: 2 },
                    { productVariantId: 'v2', returnedQty: 3 },
                ],
            },
            {
                status: 'RECEIVED',
                items: [{ productVariantId: 'v1', returnedQty: 1 }],
            },
        ]);
        expect(map.get('v1')).toBe(3);
        expect(map.get('v2')).toBe(3);
    });
});

describe('order-item-status untuk baris jasa (maklon)', () => {
    const service = (orderStatus: Parameters<typeof getOrderItemStatus>[0]['orderStatus']) =>
        getOrderItemStatus({ orderStatus, quantity: 100, deliveredQty: 0, isService: true });

    it('mengikuti status SO karena qty terkirim jasa tidak pernah bergerak', () => {
        expect(service('IN_PRODUCTION')).toMatchObject({ key: 'in_production', label: 'Dalam produksi' });
        expect(service('READY_TO_SHIP')).toMatchObject({ key: 'service_ready', label: 'Siap penutupan jasa' });
        expect(service('SHIPPED')).toMatchObject({ key: 'service_closed', label: 'Jasa ditutup' });
        expect(service('DELIVERED')).toMatchObject({ key: 'service_done', label: 'Jasa selesai' });
    });

    it('tetap draft dan dibatalkan seperti baris barang', () => {
        expect(service('DRAFT').key).toBe('draft');
        expect(service('CANCELLED').key).toBe('cancelled');
    });

    it('baris barang yang belum terkirim tetap dalam produksi meski SO sudah dikirim', () => {
        expect(
            getOrderItemStatus({ orderStatus: 'SHIPPED', quantity: 10, deliveredQty: 0 }).key,
        ).toBe('in_production');
    });
});
