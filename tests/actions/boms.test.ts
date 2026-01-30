import { describe, it, expect } from 'vitest';
import { calculateBomCost } from '../../src/lib/production-utils';

interface MockBomItem {
    productVariant: { standardCost?: number | null; buyPrice?: number | null } | null;
    quantity: number;
    scrapPercentage?: number;
}

describe('calculateBomCost', () => {
    it('should calculate total cost including scrap', () => {
        const items: MockBomItem[] = [
            {
                productVariant: { standardCost: 1000, buyPrice: 900 },
                quantity: 2,
                scrapPercentage: 0
            },
            {
                productVariant: { standardCost: null, buyPrice: 500 },
                quantity: 1,
                scrapPercentage: 10
            }
        ];

        const cost = calculateBomCost(items);
        expect(Number(cost)).toBe(2550);
    });

    it('should handle missing productVariant gracefully', () => {
        const items: MockBomItem[] = [
            {
                productVariant: null,
                quantity: 1
            },
            {
                productVariant: { standardCost: 100 },
                quantity: 1
            }
        ];
        const cost = calculateBomCost(items);
        expect(Number(cost)).toBe(100);
    });

    it('should default to 0 for missing costs', () => {
        const items: MockBomItem[] = [
            {
                productVariant: { standardCost: null, buyPrice: null },
                quantity: 1
            }
        ];
        const cost = calculateBomCost(items);
        expect(Number(cost)).toBe(0);
    });
});
