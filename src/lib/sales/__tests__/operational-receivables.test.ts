import { describe, expect, it } from 'vitest';
import {
    buildOperationalSalesReceivableOrderWhere,
    isOperationalSalesReceivableOrder,
} from '@/lib/sales/operational-receivables';

describe('isOperationalSalesReceivableOrder', () => {
    it.each([
        [{ orderNumber: 'SO-OPEN-28/INV/V/26', notes: null }, 'SO-OPEN prefix'],
        [{ orderNumber: 'OB-AR-0015', notes: null }, 'OB-AR prefix'],
        [
            { orderNumber: 'SO-2026-0009', notes: 'Opening Balance Entry' },
            'opening balance note',
        ],
        [
            {
                orderNumber: 'SO-2026-0025',
                notes: 'Sheet Penjualan Jun: 64/INV/VI/2026',
            },
            'June sheet import note',
        ],
    ])('excludes historical/import AR order by %s', (order, _reason) => {
        expect(isOperationalSalesReceivableOrder(order)).toBe(false);
    });

    it('keeps normal operational sales orders like NURKOLIS', () => {
        expect(
            isOperationalSalesReceivableOrder({
                orderNumber: 'SO-2026-0045',
                notes: null,
            }),
        ).toBe(true);
    });
});

describe('buildOperationalSalesReceivableOrderWhere', () => {
    it('keeps customer AR scope and excludes historical/import patterns', () => {
        const where = buildOperationalSalesReceivableOrderWhere();

        expect(where.customerId).toEqual({ not: null });
        expect(where.NOT).toEqual(
            expect.arrayContaining([
                { orderNumber: { startsWith: 'SO-OPEN-' } },
                { orderNumber: { startsWith: 'OB-AR-' } },
                { notes: { startsWith: 'Opening Balance Entry' } },
                { notes: { startsWith: 'Sheet Penjualan Jun:' } },
            ]),
        );
    });
});
