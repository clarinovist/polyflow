import { describe, expect, it } from 'vitest';
import { serializeData } from '../server-to-client';

// Mock Decimal class to simulate Prisma Decimal
class FakeDecimal {
    private value: string;
    constructor(val: string) {
        this.value = val;
    }
    toNumber() {
        return parseFloat(this.value);
    }
    toString() {
        return this.value;
    }
    get [Symbol.toStringTag]() {
        return 'Decimal';
    }
}

// Ensure constructor.name is 'Decimal'
Object.defineProperty(FakeDecimal, 'name', { value: 'Decimal' });

describe('serializeData', () => {
    it('returns primitive values as-is', () => {
        expect(serializeData(42)).toBe(42);
        expect(serializeData('hello')).toBe('hello');
        expect(serializeData(true)).toBe(true);
        expect(serializeData(null)).toBeNull();
        expect(serializeData(undefined)).toBeUndefined();
    });

    it('serializes Date objects to ISO strings', () => {
        const date = new Date('2026-05-31T06:00:00.000Z');
        expect(serializeData(date)).toBe('2026-05-31T06:00:00.000Z');
    });

    it('serializes objects with toISOString function to ISO strings', () => {
        const customDate = {
            toISOString: () => '2026-05-31T12:00:00.000Z',
        };
        expect(serializeData(customDate)).toBe('2026-05-31T12:00:00.000Z');
    });

    it('serializes mock Prisma Decimal to native number', () => {
        const decimalVal = new FakeDecimal('123.456');
        expect(serializeData(decimalVal)).toBe(123.456);
    });

    it('serializes hex numbers or other potential decimal types using toString', () => {
        const hexDecimalVal = {
            _hex: '0x123',
            toString: () => '291'
        };
        expect(serializeData(hexDecimalVal)).toBe(291);
    });

    it('serializes arrays recursively', () => {
        const date1 = new Date('2026-05-31T00:00:00.000Z');
        const decimal1 = new FakeDecimal('45.67');
        const arr = [123, date1, decimal1, ['nested', new FakeDecimal('1.2')]];

        expect(serializeData(arr)).toEqual([
            123,
            '2026-05-31T00:00:00.000Z',
            45.67,
            ['nested', 1.2]
        ]);
    });

    it('serializes deep nested objects recursively', () => {
        const obj = {
            id: 'item-1',
            createdAt: new Date('2026-05-31T00:00:00.000Z'),
            price: new FakeDecimal('99.99'),
            meta: {
                discount: new FakeDecimal('0.15'),
                tags: ['promo', new FakeDecimal('2026')]
            }
        };

        expect(serializeData(obj)).toEqual({
            id: 'item-1',
            createdAt: '2026-05-31T00:00:00.000Z',
            price: 99.99,
            meta: {
                discount: 0.15,
                tags: ['promo', 2026]
            }
        });
    });
});
