import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { canonicalizeReceiptQuantity } from '../receipt-quantity';

describe('canonicalizeReceiptQuantity', () => {
    it.each([
        ['1.00005', '1.0001'],
        ['1.00004', '1.0000'],
        [0.00005, '0.0001'],
        ['1.25e-2', '0.0125'],
    ])('normalizes %s to persisted four-decimal semantics', (input, expected) => {
        expect(canonicalizeReceiptQuantity(input)).toBe(expected);
    });

    it.each(['0.00004', 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 'bad'])(
        'rejects quantity that cannot persist positively: %s',
        (input) => {
            expect(() => canonicalizeReceiptQuantity(input)).toThrow(
                'Receipt quantity must be positive after rounding to 4 decimal places.',
            );
        },
    );

    it('has no runtime imports, keeping its dependency graph Prisma and Node free', () => {
        const source = readFileSync(
            new URL('../receipt-quantity.ts', import.meta.url),
            'utf8',
        );

        expect(source).not.toMatch(/^\s*import(?:\s|[{(])/m);
        expect(source).not.toMatch(/@prisma\/client|server-only|node:/);
    });
});
