import { describe, expect, it } from 'vitest';
import { shippingCostFromInput } from '../shipping-cost-input';
import { createSalesOrderSchema, updateSalesOrderSchema } from '@/lib/schemas/sales';

describe('shippingCostFromInput', () => {
    it('returns 0 for an empty input instead of NaN', () => {
        expect(shippingCostFromInput('')).toBe(0);
        expect(shippingCostFromInput('   ')).toBe(0);
    });

    it('parses a numeric string', () => {
        expect(shippingCostFromInput('150000')).toBe(150000);
    });

    it('returns 0 for NaN, negative, or non-numeric values', () => {
        expect(shippingCostFromInput(NaN)).toBe(0);
        expect(shippingCostFromInput('-5')).toBe(0);
        expect(shippingCostFromInput('abc')).toBe(0);
        expect(shippingCostFromInput(undefined)).toBe(0);
    });

    it('keeps the order schemas valid when the field is cleared', () => {
        const value = shippingCostFromInput('');
        const updateShape = updateSalesOrderSchema.shape.shippingCost;
        const createShape = createSalesOrderSchema.shape.shippingCost;
        expect(updateShape.safeParse(value).success).toBe(true);
        expect(createShape.safeParse(value).success).toBe(true);
    });
});
