import { describe, expect, it } from 'vitest';
import { buildInvoiceReturnBasis } from '../invoice-return-basis';
const evidence = {
    totalAmount:'1130',roundingAmount:'0',shippingAmount:'20',journalTaxAmount:'110',
    lines:[{sourceItemId:'item',productVariantId:'variant',quantity:'10',netAmount:'1000',taxAmount:'110',discountAmount:'250'}],
};
describe('immutable original invoice return basis',()=>{
 it('preserves original net tax and discount, excludes shipping and rounding',()=>{
    expect(buildInvoiceReturnBasis(evidence)).toEqual(evidence.lines);
    expect(buildInvoiceReturnBasis({...evidence,totalAmount:'1500',roundingAmount:'370'})).toEqual(evidence.lines);
 });
 it('refuses missing or mismatched evidence instead of repricing from current master',()=>{
    for(const input of [{...evidence,lines:[]},{...evidence,totalAmount:'1200'},{...evidence,journalTaxAmount:'109'},{...evidence,lines:[...evidence.lines,...evidence.lines]}]) {
        expect(()=>buildInvoiceReturnBasis(input)).toThrow();
    }
 });
 it('rejects negative, nonfinite, or overprecision source values',()=>{
    for(const invalid of [{quantity:'0'},{netAmount:'NaN'},{discountAmount:'-1'},{taxAmount:'1.111'}]) {
        expect(()=>buildInvoiceReturnBasis({...evidence,lines:[{...evidence.lines[0],...invalid}]})).toThrow();
    }
 });
});
