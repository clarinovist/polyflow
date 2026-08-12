import { describe, expect, it } from 'vitest';
import { resolvePackagingTransferQuantity } from '@/lib/production/packaging-container';

describe('resolvePackagingTransferQuantity', () => {
    it('returns plannedQty unchanged when containerSize is not set', () => {
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 18,
                floorStock: 0,
                containerSize: null,
            }),
        ).toBe(18);
    });

    it('returns plannedQty unchanged when containerSize is 0 or negative', () => {
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 18,
                floorStock: 0,
                containerSize: 0,
            }),
        ).toBe(18);
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 18,
                floorStock: 0,
                containerSize: -5,
            }),
        ).toBe(18);
    });

    it('rounds shortfall up to the nearest whole container when floor stock is empty', () => {
        // SPK-001 dari contoh plan: planned 18kg, floor 0, container 25kg -> 1 zak
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 18,
                floorStock: 0,
                containerSize: 25,
            }),
        ).toBe(25);
    });

    it('rounds up the remaining shortfall after existing floor stock is applied', () => {
        // SPK-002 dari contoh plan: planned 13.5kg, floor 7.9kg -> shortfall 5.6 -> 1 zak
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 13.5,
                floorStock: 7.9,
                containerSize: 25,
            }),
        ).toBe(25);
    });

    it('returns 0 when floor stock already covers the plan (no transfer needed)', () => {
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 13.5,
                floorStock: 20,
                containerSize: 25,
            }),
        ).toBe(0);
    });

    it('returns exactly the shortfall rounded when it lands on a whole multiple', () => {
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 50,
                floorStock: 0,
                containerSize: 25,
            }),
        ).toBe(50);
    });

    it('never returns a negative quantity when floor stock exceeds plannedQty', () => {
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 5,
                floorStock: 100,
                containerSize: 25,
            }),
        ).toBe(0);
    });

    it('treats missing floorStock as 0', () => {
        expect(
            resolvePackagingTransferQuantity({
                plannedQty: 18,
                containerSize: 25,
            }),
        ).toBe(25);
    });
});
