import { describe, expect, it } from 'vitest';
import { manualReturnCreditSchema } from '../manual-return-credit';
const input = { returnId: 'return', invoiceId: 'invoice', postingDate: '2026-09-19T00:00:00+07:00', totalAmount: '222.00', taxAmount: '22.00', expectedRemaining: '1110.00', reason: 'Verified return amount', evidence: 'Original invoice and signed return receipt', confirmed: true };
describe('explicit Finance manual valuation', () => {
    it('accepts explicit total and tax without inventing historical quantities', () => {
        expect(manualReturnCreditSchema.parse(input)).toMatchObject({ totalAmount: '222.00', taxAmount: '22.00' });
        expect(manualReturnCreditSchema.parse({ ...input, taxAmount: '0' }).taxAmount).toBe('0');
    });
    it.each(['', '-1', 'NaN', 'Infinity', '1e3', '1,000', '1.001', '10000000000000'])('rejects invalid money %s', totalAmount => {
        expect(manualReturnCreditSchema.safeParse({ ...input, totalAmount }).success).toBe(false);
    });
    it.each([{ totalAmount: '0' }, { taxAmount: '223' }, { confirmed: false }, { evidence: '' }, { reason: '' }, { taxAmount: undefined }, { expectedRemaining: undefined }])('requires bounded amounts and explicit evidence/approval %j', patch => {
        expect(manualReturnCreditSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    });
});
