import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { assertPackagingGroupTotal, assertPackagingOwnerTransfer, assertPackagingSourceOwner, packagingGroupCosts } from '../packaging-policy';
import { packagedOutputSchema } from '@/lib/schemas/production-packaging';

const row = { productVariantId: 'label', sourceLocationId: 'location', ownerCustomerId: null, quantity: 100 };
const group = { productVariantId: 'brand-a', quantity: 247, packaging: [row] };
const payload = { clientRequestId: 'ce26b37c-85c5-46cb-bc5c-5ec212db2da4', groups: [group] };
const d = (value: number) => new Prisma.Decimal(value);

describe('actual packaging contracts', () => {
    it('keeps KG independent of sack PCS and accepts at most two different brands', () => {
        expect(packagedOutputSchema.parse(payload).groups[0].quantity).toBe(247);
        expect(packagedOutputSchema.parse({ ...payload, groups: [{ ...group, packaging: [{ ...row, quantity: 10 }] }] }).groups[0].quantity).toBe(247);
        expect(packagedOutputSchema.safeParse({ ...payload, groups: [group, { ...group, productVariantId: 'b' }] }).success).toBe(true);
        expect(packagedOutputSchema.safeParse({ ...payload, groups: [group, { ...group, productVariantId: 'b' }, { ...group, productVariantId: 'c' }] }).success).toBe(false);
        expect(packagedOutputSchema.safeParse({ ...payload, groups: [group, group] }).success).toBe(false);
    });
    it.each([0, -1, 0.5, Infinity, NaN])('rejects invalid actual packaging count %s', (quantity) => {
        expect(packagedOutputSchema.safeParse({ ...payload, groups: [{ ...group, packaging: [{ ...row, quantity }] }] }).success).toBe(false);
    });
    it('rejects duplicate source rows and inconsistent output totals', () => {
        expect(packagedOutputSchema.safeParse({ ...payload, groups: [{ ...group, packaging: [row, row] }] }).success).toBe(false);
        expect(() => assertPackagingGroupTotal([{ quantity: 0.1 }, { quantity: 0.2 }], 0.3)).not.toThrow();
        expect(() => assertPackagingGroupTotal([group], 250)).toThrow();
    });
    it('requires explicit matching custody ownership, not brand or an unclassified location', () => {
        expect(assertPackagingSourceOwner({ locationType: 'INTERNAL' }, null)).toBe(true);
        expect(assertPackagingSourceOwner({ locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'a' }, 'a')).toBe(false);
        expect(() => assertPackagingSourceOwner({ locationType: 'CUSTOMER_OWNED' }, 'a')).toThrow();
        expect(() => assertPackagingSourceOwner({ locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'a' }, 'b')).toThrow();
        expect(() => assertPackagingSourceOwner({ locationType: 'INTERNAL' }, 'a')).toThrow();
        expect(() => assertPackagingSourceOwner({ locationType: 'EXTERNAL' }, null)).toThrow();
    });
    it('does not allow transfer to launder ownership', () => {
        const source = { locationType: 'CUSTOMER_OWNED', packagingOwnerCustomerId: 'a' };
        expect(() => assertPackagingOwnerTransfer(source, source)).not.toThrow();
        expect(() => assertPackagingOwnerTransfer(source, { ...source, packagingOwnerCustomerId: 'b' })).toThrow();
        expect(() => assertPackagingOwnerTransfer(source, { locationType: 'INTERNAL' })).toThrow();
        expect(() => assertPackagingOwnerTransfer({ locationType: 'INTERNAL' }, { locationType: 'INTERNAL' })).not.toThrow();
    });
    it('allocates per-posting costs without losing varying packaging costs on partial outputs', () => {
        const first = packagingGroupCosts(d(0), [{ quantity: 10, packagingCost: d(100) }]);
        const second = packagingGroupCosts(d(0), [{ quantity: 10, packagingCost: d(300) }]);
        expect(first[0].amount.plus(second[0].amount).toNumber()).toBe(400);
        expect(second[0].unitCost.toNumber()).toBe(30);
        const mixed = packagingGroupCosts(d(100), [{ quantity: 1, packagingCost: d(0) }, { quantity: 2, packagingCost: d(12) }]);
        expect(mixed.reduce((sum, cost) => sum.plus(cost.amount), d(0)).toNumber()).toBe(112);
    });
});
