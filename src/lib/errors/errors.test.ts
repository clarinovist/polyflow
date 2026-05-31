import { describe, expect, it } from 'vitest';
import {
    safeAction,
    InsufficientStockError,
    ProductionRuleViolationError,
} from './errors';

describe('ApplicationError classes', () => {
    it('sets code and statusCode correctly for InsufficientStockError', () => {
        const err = new InsufficientStockError('Stock is missing');
        expect(err.message).toBe('Stock is missing');
        expect(err.code).toBe('INSUFFICIENT_STOCK');
        expect(err.statusCode).toBe(422);
    });

    it('sets code and statusCode correctly for ProductionRuleViolationError', () => {
        const err = new ProductionRuleViolationError('Invalid step');
        expect(err.message).toBe('Invalid step');
        expect(err.code).toBe('PRODUCTION_RULE_VIOLATION');
        expect(err.statusCode).toBe(422);
    });
});

describe('safeAction helper', () => {
    it('returns success: true when fn resolves successfully', async () => {
        const res = await safeAction(async () => 'hello');
        expect(res).toEqual({ success: true, data: 'hello' });
    });

    it('catches ApplicationError and returns success: false with correct error code', async () => {
        const res = await safeAction(async () => {
            throw new InsufficientStockError('Insufficient stock');
        });
        expect(res).toEqual({
            success: false,
            error: 'Insufficient stock',
            code: 'INSUFFICIENT_STOCK'
        });
    });

    it('catches generic Error and returns generic INTERNAL_ERROR code', async () => {
        const res = await safeAction(async () => {
            throw new Error('Something went wrong');
        });
        expect(res).toEqual({
            success: false,
            error: 'An unexpected error occurred',
            code: 'INTERNAL_ERROR'
        });
    });
});
