import { describe, expect, it } from 'vitest';

import { executionScrapTotal } from '../execution-scrap';

describe('executionScrapTotal', () => {
    it('returns prongkol + daun when generic scrap is 0 (main form shape)', () => {
        expect(
            executionScrapTotal({
                scrapQuantity: 0,
                scrapProngkolQty: 102.4,
                scrapDaunQty: 199.3,
            }),
        ).toBeCloseTo(301.7, 5);
    });

    it('returns generic when it duplicates affal columns (kiosk shape)', () => {
        expect(
            executionScrapTotal({
                scrapQuantity: 12,
                scrapProngkolQty: 7,
                scrapDaunQty: 5,
            }),
        ).toBe(12);
    });

    it('handles null/undefined fields', () => {
        expect(executionScrapTotal({})).toBe(0);
        expect(
            executionScrapTotal({ scrapProngkolQty: null, scrapDaunQty: 4 }),
        ).toBe(4);
    });

    it('accepts Prisma Decimal-like objects', () => {
        const dec = (n: number) => ({ toNumber: () => n, valueOf: () => n });
        expect(
            executionScrapTotal({
                scrapQuantity: dec(0),
                scrapProngkolQty: dec(2.5),
                scrapDaunQty: dec(3.5),
            }),
        ).toBeCloseTo(6, 5);
    });

    it('picks the larger side when shapes deviate from the invariant', () => {
        expect(
            executionScrapTotal({
                scrapQuantity: 50,
                scrapProngkolQty: 10,
                scrapDaunQty: 10,
            }),
        ).toBe(50);
    });
});
