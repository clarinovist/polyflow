import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import {
    canonicalizeReceiptQuantity,
    resolveReceiptNetTotal,
    resolveReceiptNetUnitCost,
} from '../receipt-valuation';

describe('canonicalizeReceiptQuantity', () => {
    it.each([
        ['1.00005', '1.0001'],
        ['1.00004', '1.0000'],
    ])('rounds %s to persisted scale as %s', (input, expected) => {
        expect(canonicalizeReceiptQuantity(input).toFixed(4)).toBe(expected);
    });

    it.each(['0.00004', 0, -1, NaN, Infinity])(
        'rejects quantity that cannot persist positively: %s',
        (input) => {
            expect(() => canonicalizeReceiptQuantity(input)).toThrow();
        },
    );
});

describe('resolveReceiptNetTotal', () => {
    const price = { unitPrice: '10000', taxPercent: '11', ppnMode: 'INCLUDE' };
    it('rounds the extended total, not the persisted unit cost', () => {
        expect(resolveReceiptNetUnitCost(price).toFixed(4)).toBe('9009.0090');
        expect(resolveReceiptNetTotal(price, '1500').toFixed(2)).toBe('13513513.51');
        expect(resolveReceiptNetTotal({ ...price, discountPercent: '10' }, 1500).toFixed(2)).toBe('12162162.16');
    });
    it('allocates cents across partials without multiplying rounded unit costs', () => {
        const previous = resolveReceiptNetTotal(price, 500);
        const total = resolveReceiptNetTotal(price, 1500);
        expect(previous.toFixed(2)).toBe('4504504.50');
        expect(total.minus(previous).toFixed(2)).toBe('9009009.01');
    });
    it('handles zero, fractional quantities, EXCLUDE, and maklon', () => {
        expect(resolveReceiptNetTotal(price, 0).toFixed(2)).toBe('0.00');
        expect(resolveReceiptNetTotal({ unitPrice: '10.125', discountPercent: 10 }, '2.5').toFixed(2)).toBe('22.78');
        expect(resolveReceiptNetTotal({ ...price, ppnMode: 'EXCLUDE' }, 2).toFixed(2)).toBe('20000.00');
        expect(resolveReceiptNetTotal(price, 1500, { isMaklon: true }).toFixed(2)).toBe('0.00');
    });
    it.each([-1, NaN, Infinity, 'bad', new Prisma.Decimal(NaN)])('rejects invalid received quantity %s', qty => {
        expect(() => resolveReceiptNetTotal(price, qty)).toThrow('tidak valid');
    });
    it.each(['discountPercent', 'taxPercent'] as const)('rejects non-finite persisted %s', field => {
        expect(() => resolveReceiptNetTotal({ ...price, [field]: new Prisma.Decimal(NaN) }, 1)).toThrow('0-100');
    });
});

describe('resolveReceiptNetUnitCost', () => {
    it('strips INCLUDE PPN to net acquisition cost (synthetic 0128)', () => {
        expect(
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal('29748'),
                discountPercent: new Prisma.Decimal(0),
                taxPercent: new Prisma.Decimal(11),
                ppnMode: 'INCLUDE',
            }).toFixed(4),
        ).toBe('26800.0000');
    });

    it('keeps EXCLUDE price as net cost', () => {
        expect(
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal('26800'),
                discountPercent: new Prisma.Decimal(0),
                taxPercent: new Prisma.Decimal(11),
                ppnMode: 'EXCLUDE',
            }).toFixed(4),
        ).toBe('26800.0000');
    });

    it('applies discount before stripping INCLUDE tax', () => {
        const actual = resolveReceiptNetUnitCost({
            unitPrice: new Prisma.Decimal('10000'),
            discountPercent: new Prisma.Decimal(10),
            taxPercent: new Prisma.Decimal(11),
            ppnMode: 'INCLUDE',
        });
        const expected = new Prisma.Decimal('9000')
            .div(new Prisma.Decimal('1.11'))
            .toDecimalPlaces(4);
        expect(actual.equals(expected)).toBe(true);
    });

    it('keeps tax-zero and EXCLUDE branches exact', () => {
        expect(
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal('123.4567'),
                discountPercent: new Prisma.Decimal('2.5'),
                taxPercent: new Prisma.Decimal(0),
                ppnMode: 'INCLUDE',
            }).toFixed(4),
        ).toBe(
            new Prisma.Decimal('123.4567')
                .mul(new Prisma.Decimal('0.975'))
                .toDecimalPlaces(4)
                .toFixed(4),
        );
    });

    it('keeps fractional INCLUDE unit rounding exact across repeated partials', () => {
        const unit = resolveReceiptNetUnitCost({
            unitPrice: new Prisma.Decimal('0.05'),
            discountPercent: new Prisma.Decimal(0),
            taxPercent: new Prisma.Decimal(11),
            ppnMode: 'INCLUDE',
        });
        const expected = new Prisma.Decimal('0.05')
            .div(new Prisma.Decimal('1.11'))
            .toDecimalPlaces(4);
        expect(unit.equals(expected)).toBe(true);
        expect(unit.toFixed(4)).toBe('0.0450');
        const repeated = unit.mul(3).toDecimalPlaces(4);
        const aggregate = new Prisma.Decimal('0.15')
            .div(new Prisma.Decimal('1.11'))
            .toDecimalPlaces(4);
        expect(repeated.toFixed(4)).toBe('0.1350');
        expect(aggregate.toFixed(4)).toBe('0.1351');
        expect(repeated.minus(aggregate).abs().toFixed(4)).toBe('0.0001');
    });

    it('rejects invalid amounts, percents, and PPN modes', () => {
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal(-1),
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('Harga PO tidak valid');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: null as unknown as Prisma.Decimal,
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('Harga PO tidak valid');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: 'not-a-number',
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('tidak valid');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal(100),
                discountPercent: 'not-a-number',
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('tidak valid');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal(100),
                taxPercent: new Prisma.Decimal(11),
                ppnMode: 'UNKNOWN',
            }),
        ).toThrow('Mode PPN tidak valid');
    });

    it('rejects non-finite amounts and out-of-range percents', () => {
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: Number.NaN,
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('tidak valid');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: Number.POSITIVE_INFINITY,
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('tidak valid');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal(100),
                discountPercent: new Prisma.Decimal(150),
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('0-100');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal(100),
                discountPercent: new Prisma.Decimal(-5),
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('0-100');
        expect(() =>
            resolveReceiptNetUnitCost({
                unitPrice: new Prisma.Decimal(100),
                taxPercent: new Prisma.Decimal(150),
                ppnMode: 'EXCLUDE',
            }),
        ).toThrow('0-100');
    });

    it('returns explicit zero for maklon path', () => {
        expect(
            resolveReceiptNetUnitCost(
                {
                    unitPrice: new Prisma.Decimal('29748'),
                    discountPercent: new Prisma.Decimal(0),
                    taxPercent: new Prisma.Decimal(11),
                    ppnMode: 'INCLUDE',
                },
                { isMaklon: true },
            ).isZero(),
        ).toBe(true);
    });
});
