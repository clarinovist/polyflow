import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { ValidationError } from '@/lib/errors/errors';
import { toStockQuantity } from '../stock-quantity';

describe('toStockQuantity', () => {
    it('rounds half-up at the 5th decimal place (0.12345 -> 0.1235)', () => {
        const result = toStockQuantity(0.12345);
        expect(result).toBeInstanceOf(Prisma.Decimal);
        expect(result.toString()).toBe('0.1235');
        expect(result.equals(new Prisma.Decimal('0.1235'))).toBe(true);
    });

    it('rounds down below half at the 5th decimal place (0.123449 -> 0.1234)', () => {
        const result = toStockQuantity(0.123449);
        expect(result).toBeInstanceOf(Prisma.Decimal);
        expect(result.toString()).toBe('0.1234');
        expect(result.equals(new Prisma.Decimal('0.1234'))).toBe(true);
    });

    it('preserves integers and exact 4-decimal quantities', () => {
        expect(toStockQuantity(0).toString()).toBe('0');
        expect(toStockQuantity(50).toString()).toBe('50');
        expect(toStockQuantity(12.3456).toString()).toBe('12.3456');
    });

    it('accepts Prisma.Decimal and numeric string inputs', () => {
        expect(toStockQuantity(new Prisma.Decimal('0.12345')).toString()).toBe(
            '0.1235',
        );
        expect(toStockQuantity(new Prisma.Decimal('10')).toString()).toBe('10');
        expect(toStockQuantity('0.12345').toString()).toBe('0.1235');
    });

    it('rejects negative quantities', () => {
        expect(() => toStockQuantity(-1)).toThrow(ValidationError);
        expect(() => toStockQuantity(-0.0001)).toThrow(ValidationError);
        expect(() => toStockQuantity(new Prisma.Decimal('-0.1234'))).toThrow(
            ValidationError,
        );
    });

    it('rejects NaN, Infinity, and invalid values', () => {
        expect(() => toStockQuantity(Number.NaN)).toThrow(ValidationError);
        expect(() => toStockQuantity(Number.POSITIVE_INFINITY)).toThrow(
            ValidationError,
        );
        expect(() => toStockQuantity(Number.NEGATIVE_INFINITY)).toThrow(
            ValidationError,
        );
        expect(() => toStockQuantity('not-a-number')).toThrow(ValidationError);
    });
});
