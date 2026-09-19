import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { calculateReturnProposal } from '../return-credit-proposal';
const D = (value: number) => new Prisma.Decimal(value);
const input = () => ({ totalAmount: D(1110), roundingAmount: D(0), shippingAmount: D(0), journalTax: D(110), items: [{ id: 'source', productVariantId: 'variant', quantity: D(10), deliveredQty: D(10), unitPrice: D(125), discountPercent: D(20), taxPercent: D(11), ppnMode: 'EXCLUDE' }], returned: [{ productVariantId: 'variant', returnedQty: D(2) }], basis: [] });
describe('return proposal uses linked documents, never product master or entered return price', () => {
    it('derives explicit Finance-reviewed SO proposal matching full invoice and tax', () => {
        expect(calculateReturnProposal(input())).toEqual({ totalAmount: '222.00', taxAmount: '22.00', source: 'SO_REVIEW' });
    });
    it('rejects mismatched invoice, tax, repeated SKU and excessive quantity', () => {
        for (const patch of [{ totalAmount: D(999) }, { journalTax: D(99) }, { items: [...input().items, ...input().items] }, { returned: [{ productVariantId: 'variant', returnedQty: D(11) }] }]) {
            expect(() => calculateReturnProposal({ ...input(), ...patch })).toThrow();
        }
    });
    it('handles included tax and does not credit shipping or rounding', () => {
        const data = input(); data.items[0].ppnMode = 'INCLUDE'; data.items[0].unitPrice = D(138.75);
        expect(calculateReturnProposal({ ...data, totalAmount: D(1125), shippingAmount: D(10), roundingAmount: D(5) }).totalAmount).toBe('222.00');
    });
    it('rejects empty, foreign, invalid source and fake snapshot evidence', () => {
        for (const patch of [{ items: [] }, { returned: [] }, { returned: [{ productVariantId: 'other', returnedQty: D(1) }] }, { returned: [{ productVariantId: 'variant', returnedQty: D(0) }] }]) {
            expect(() => calculateReturnProposal({ ...input(), ...patch })).toThrow();
        }
        const data = input(); data.items[0].discountPercent = D(101); expect(() => calculateReturnProposal(data)).toThrow();
        expect(() => calculateReturnProposal({ ...input(), basis: [{ sourceItemId: 'source', productVariantId: 'variant', quantity: D(10), netAmount: D(1000), taxAmount: D(110), discountAmount: D(250), sourceEvidence: {} }] })).toThrow();
    });
    it('prefers immutable invoice basis even when current SO prices changed', () => {
        const data = input(); data.items[0].unitPrice = D(999);
        expect(calculateReturnProposal({ ...data, basis: [{ sourceItemId: 'source', productVariantId: 'variant', quantity: D(10), netAmount: D(1000), taxAmount: D(110), discountAmount: D(250), sourceEvidence: { version: 1, capturedAtInvoiceCreation: true } }] })).toEqual({ totalAmount: '222.00', taxAmount: '22.00', source: 'SNAPSHOT' });
    });
});
