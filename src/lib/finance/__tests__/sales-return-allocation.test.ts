import { describe, expect, it } from 'vitest';
import { allocateReturnValue, getSalesInvoiceBalance, getSalesInvoiceSettlementStatus, classifyReturnCredit } from '../sales-return-allocation';

const basis = { quantity: '3', netAmount: '100', taxAmount: '11', discountAmount: '10' };
describe('return credit policy: original net/tax, cumulative precision', () => {
    it('allocates net, tax and informational discount from the original document', () => {
        const credit = allocateReturnValue(basis, '0', '1');
        expect(credit.netAmount.toFixed(2)).toBe('33.33');
        expect(credit.taxAmount.toFixed(2)).toBe('3.67');
        expect(credit.discountAmount.toFixed(2)).toBe('3.33');
        expect(credit.totalAmount.toFixed(2)).toBe('37.00');
    });
    it('consumes residual cents exactly once across fractional/repeated returns', () => {
        const pieces = ['0','1','2'].map((previous) => allocateReturnValue(basis, previous, '1'));
        expect(pieces.map((p) => p.netAmount.toFixed(2))).toEqual(['33.33','33.34','33.33']);
        expect(pieces.reduce((sum,p) => sum + Number(p.totalAmount),0)).toBe(111);
        expect(allocateReturnValue(basis, '2', '1').taxAmount.toFixed(2)).toBe('3.67');
    });
    it('does not subtract discount twice or add current master price', () => {
        expect(allocateReturnValue(basis, '0', '3').totalAmount.toFixed(2)).toBe('111.00');
    });
    it.each([
        ['0','0'], ['0','-1'], ['2','2'], ['-1','1'], ['0','NaN'], ['0','Infinity'], ['0','0.00001'],
    ])('rejects invalid/overreturned quantities %s + %s', (previous, qty) => {
        expect(() => allocateReturnValue(basis, previous, qty)).toThrow();
    });
    it('rejects corrupt source values rather than using an estimate', () => {
        for(const invalid of [{ quantity: '0' }, { netAmount: '-1' }, { taxAmount: 'NaN' }, { netAmount: '1.001' }]) {
            expect(() => allocateReturnValue({ ...basis, ...invalid }, '0', '1')).toThrow();
        }
    });
    it('allows a fully discounted free item without inventing a value', () => {
        expect(allocateReturnValue({ quantity:'2', netAmount:'0', taxAmount:'0',discountAmount:'20' }, '0','2').totalAmount.toFixed(2)).toBe('0.00');
    });
});

describe('AR remaining and review policy', () => {
    it('subtracts posted return credits without modifying payments or gross', () => {
        expect(getSalesInvoiceBalance({totalAmount:'1000',paidAmount:'200',creditedAmount:'300'}).toFixed(2)).toBe('500.00');
    });
    it('classifies credited balances without calling credit a cash payment', () => {
        expect(getSalesInvoiceSettlementStatus({totalAmount:'100',paidAmount:'0',creditedAmount:'100'})).toBe('PAID');
        expect(getSalesInvoiceSettlementStatus({totalAmount:'100',paidAmount:'0',creditedAmount:'30'})).toBe('PARTIAL');
        expect(getSalesInvoiceSettlementStatus({totalAmount:'100',paidAmount:'0',creditedAmount:'0'})).toBe('UNPAID');
        expect(getSalesInvoiceSettlementStatus({totalAmount:'100',paidAmount:'0',creditedAmount:'30',dueDate:new Date('2026-01-01')},new Date('2026-09-18'))).toBe('OVERDUE');
        expect(()=>getSalesInvoiceSettlementStatus({totalAmount:'100',paidAmount:'80',creditedAmount:'30'})).toThrow();
    });
    it('retains negative anomalies, never hides them by clamping', () => {
        expect(getSalesInvoiceBalance({totalAmount:'100',paidAmount:'80',creditedAmount:'30'}).toFixed(2)).toBe('-10.00');
    });
    it('accepts exact settlement but routes over-credit and paid invoices to review', () => {
        expect(classifyReturnCredit('500','500')).toBe('READY');
        expect(classifyReturnCredit('500.01','500')).toBe('REVIEW_REQUIRED');
        expect(classifyReturnCredit('10','0')).toBe('REVIEW_REQUIRED');
        expect(classifyReturnCredit('10','-1')).toBe('REVIEW_REQUIRED');
    });
    it('rejects nonpositive or nonfinite credit amounts', () => {
        for(const value of ['0','-1','NaN','Infinity']) expect(() => classifyReturnCredit(value,'100')).toThrow();
    });
});
