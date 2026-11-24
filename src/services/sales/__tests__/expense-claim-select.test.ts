import { describe, expect, it } from 'vitest';
import { CLAIM_VIEW_SELECT, PAID_CLAIM_SELECT } from '../expense-claim-select';

describe('CLAIM_VIEW_SELECT', () => {
    it('exposes the journal number but no other journal field', () => {
        expect(CLAIM_VIEW_SELECT.journalEntry).toEqual({ select: { entryNumber: true } });
    });

    it('keeps the submitter and the visit customer to a name only', () => {
        expect(CLAIM_VIEW_SELECT.user).toEqual({ select: { name: true } });
        expect(CLAIM_VIEW_SELECT.salesVisit.select.customer).toEqual({ select: { name: true } });
    });
});

describe('PAID_CLAIM_SELECT', () => {
    it('extends the claim view with the paid date and account code/name only', () => {
        expect(PAID_CLAIM_SELECT).toMatchObject({ ...CLAIM_VIEW_SELECT, paidAt: true });
        expect(PAID_CLAIM_SELECT.expenseAccount).toEqual({ select: { code: true, name: true } });
        expect(PAID_CLAIM_SELECT.paymentAccount).toEqual({ select: { code: true, name: true } });
    });

    it('does not select the reviewer or payer relations', () => {
        const keys = Object.keys(PAID_CLAIM_SELECT);
        expect(keys).not.toContain('paidBy');
        expect(keys).not.toContain('reviewedBy');
    });
});
