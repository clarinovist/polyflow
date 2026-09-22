import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { creditBalance, creditDate, creditSignature, applyCustomerCreditInput, issueCustomerCreditInput, customerCreditLinkInput } from '../customer-credit';
const d=(v:string)=>new Prisma.Decimal(v);
describe('customer credit contracts',()=>{
 it('keeps remaining credit exact and ignores reversed applications',()=>{
  expect(creditBalance(d('5809300'),[{totalAmount:d('5125000'),status:'POSTED'},{totalAmount:d('100'),status:'REVERSED'}]).toFixed(2)).toBe('684300.00');
 });
 it('rejects unconfirmed, non-money and missing identity evidence',()=>{
  const common={postingDate:new Date(),reason:'Accepted return credit',confirmed:true};
  expect(issueCustomerCreditInput.safeParse({...common,returnId:'r',invoiceId:'i',totalAmount:'100.00',taxAmount:'0',evidence:'Reviewed invoice evidence'}).success).toBe(true);
  for(const totalAmount of ['-1','1,000','1.001','NaN'])expect(issueCustomerCreditInput.safeParse({...common,returnId:'r',invoiceId:'i',totalAmount,taxAmount:'0',evidence:'Reviewed invoice evidence'}).success).toBe(false);
  expect(applyCustomerCreditInput.safeParse({...common,confirmed:false}).success).toBe(false);
  expect(customerCreditLinkInput.safeParse({fromCustomerId:'a',toCustomerId:'b',reason:'Same person',confirmed:true}).success).toBe(false);
 });
 it('enforces date bounds and stable request signatures',()=>{
  expect(()=>creditDate(new Date('2026-01-01'),new Date('2026-02-01'))).toThrow();
  expect(()=>creditDate(new Date('2099-01-01'),new Date('2026-01-01'))).toThrow();
  expect(()=>creditDate(new Date('2026-02-01'),new Date('2026-01-01'))).not.toThrow();
  expect(creditSignature({amount:'10'})).toBe(creditSignature({amount:'10'}));
  expect(creditSignature({amount:'10'})).not.toBe(creditSignature({amount:'11'}));
 });
});
