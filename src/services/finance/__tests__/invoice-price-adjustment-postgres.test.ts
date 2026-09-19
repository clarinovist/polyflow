import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, date, resetReturnFixture } from './return-credit-postgres-fixture';
vi.mock('@/services/accounting/account-resolver',()=>({resolveAccount:async(role:string)=>({id:role==='accounts-receivable'?'ar':role==='vat-output'?'vat':role==='sales-revenue'?'revenue':role==='sales-return'?'return':role==='accounts-payable'?'ap':'cash'})}));
vi.mock('@/services/settings/app-settings-service',()=>({getPaymentBanksSetting:async()=>[]}));
import { tenantContext } from '@/lib/core/prisma';
import { getPriceAdjustmentSource } from '../invoice-price-source';
import { postInvoicePriceAdjustment, reverseInvoicePriceAdjustment } from '../invoice-price-adjustment-service';
import { recordCustomerPaymentInTransaction } from '../customer-payment-service';
import { postManualReturnCreditInTransaction } from '../manual-return-credit-service';
import { postReturnCreditInTransaction } from '../sales-return-credit-service';
import { RekapDagangService } from '../rekap-dagang-service';
import { BarterSettlementService } from '../barter-settlement-service';
import { createInvoice, createDraftInvoiceFromOrder } from '../invoice-lifecycle-service';
function client(url:string){const u=new URL(url);if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!=='127.0.0.1'||u.port!=='55469'||!['/polyflow_return_credit_scope_test','/polyflow_return_credit_tenant_test'].includes(u.pathname)||u.search)throw Error('Only owned price-adjustment disposable DB allowed');return new PrismaClient({datasources:{db:{url}}});}
const url=process.env.PRICE_ADJUSTMENT_TEST_DATABASE_URL;const db=url?client(url):null;
const source=()=>db!.$transaction(tx=>getPriceAdjustmentSource(tx,'invoice'));
async function input(price='90'){const s=await source();return{invoiceId:'invoice',sourceItemId:'source-item',quantity:'2',newNetUnitPrice:price,sourceFingerprint:s.fingerprint,expectedRemaining:s.invoice.remainingAmount.toString(),postingDate:date,reason:'Synthetic agreed price change',idempotencyKey:randomUUID(),confirmed:true};}
const post=(data:unknown)=>tenantContext.run(db!,()=>postInvoicePriceAdjustment(data,actor));
describe.skipIf(!db)('invoice price changes on actual disposable PostgreSQL',()=>{
 beforeEach(async()=>{const marker=await db!.$queryRaw<{purpose:string}[]>`SELECT purpose FROM "PriceAdjustmentDisposableMarker"`;if(marker.length!==1||marker[0].purpose!=='price-adjustment-synthetic-only')throw Error('Price marker required');await resetReturnFixture(db!,false);});
 afterAll(async()=>{await db?.$disconnect();});
 it('posts price reduction, preserves gross/cash/stock and compensates without deleting history',async()=>{
  const result=await post(await input());expect(result.totalAmount.toString()).toBe('-22.2');
  let invoice=await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}});expect(invoice.remainingAmount.toString()).toBe('1087.8');expect(invoice.totalAmount.toString()).toBe('1110');expect(invoice.paidAmount.toString()).toBe('0');
  expect(await db!.payment.count()).toBe(0);expect(await db!.stockMovement.count()).toBe(1);
  await tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({adjustmentId:result.id,reversalDate:date,reason:'Synthetic correction'},actor));
  invoice=await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}});expect(invoice.remainingAmount.toString()).toBe('1110');expect(await db!.invoicePriceAdjustment.count()).toBe(1);
 });
 it('increases outstanding even after original invoice fully paid and uses new payment limit',async()=>{
  await db!.invoice.update({where:{id:'invoice'},data:{paidAmount:1110,status:'PAID'}});const data=await input('120');await post(data);
  const invoice=await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}});expect(invoice.remainingAmount.toString()).toBe('44.4');expect(invoice.status).not.toBe('PAID');
  await db!.account.create({data:{id:'cash',code:'11100',name:'Synthetic Cash',type:'ASSET',category:'CURRENT_ASSET'}});
  await expect(db!.$transaction(tx=>recordCustomerPaymentInTransaction(tx,{invoiceId:'invoice',amount:45,paymentDate:date,method:'Cash'},'OVERPAY',actor))).rejects.toThrow();
  await db!.$transaction(tx=>recordCustomerPaymentInTransaction(tx,{invoiceId:'invoice',amount:44.4,paymentDate:date,method:'Cash'},'PAY',actor));expect((await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}})).status).toBe('PAID');
 });
 it('serializes double-submit and prevents another active adjustment on same item',async()=>{const data=await input();const results=await Promise.all([post(data),post(data)]);expect(results[0].id).toBe(results[1].id);await expect(post(await input('80'))).rejects.toThrow();expect(await db!.invoicePriceAdjustment.count()).toBe(1);});
 it('rejects stale source, unconfirmed, too much quantity, missing tenant and negative remaining',async()=>{
  const data=await input();await db!.invoice.update({where:{id:'invoice'},data:{paidAmount:100}});await expect(post(data)).rejects.toThrow(/berubah/);
  await expect(post({...await input(),confirmed:false})).rejects.toThrow();await expect(post({...await input(),quantity:'11'})).rejects.toThrow(/sisa barang/);
  await expect(postInvoicePriceAdjustment(data,actor)).rejects.toThrow('tenant');
  await db!.invoice.update({where:{id:'invoice'},data:{paidAmount:1110,status:'PAID'}});await expect(post(await input())).rejects.toThrow(/refund/);
 });
 it('reflects signed adjustment and reversal in historical AR report',async()=>{const row=await post(await input());const read=()=>tenantContext.run(db!,()=>RekapDagangService.getPiutangRecap({from:'2026-09-01',to:'2026-09-30'}));expect((await read()).rows[0].closingBalance).toBe(1087.8);await tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({adjustmentId:row.id,reversalDate:date,reason:'Synthetic correction'},actor));expect((await read()).rows[0].closingBalance).toBe(1110);});
 it('serializes price reduction against concurrent cash payment and leaves no over-settlement',async()=>{
  const data=await input('0');await db!.account.create({data:{id:'cash',code:'11100',name:'Synthetic Cash',type:'ASSET',category:'CURRENT_ASSET'}});
  const outcomes=await Promise.allSettled([post(data),db!.$transaction(tx=>recordCustomerPaymentInTransaction(tx,{invoiceId:'invoice',amount:1000,paymentDate:date,method:'Cash'},'PRICE-PAY-RACE',actor))]);
  expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1);expect((await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}})).remainingAmount.gte(0)).toBe(true);
 });
 it('keeps barter and its void consistent with the price-adjusted receivable',async()=>{
  await post(await input('120'));
  await db!.supplier.create({data:{id:'supplier',name:'Synthetic Supplier'}});await db!.barterPartner.create({data:{id:'partner',customerId:'customer',supplierId:'supplier',isActive:true,createdById:actor,updatedById:actor}});
  await db!.purchaseOrder.create({data:{id:'po',orderNumber:'SYNTHETIC-PO',supplierId:'supplier',status:'SENT'}});
  await db!.purchaseInvoice.create({data:{id:'payable',invoiceNumber:'SYNTHETIC-AP',purchaseOrderId:'po',totalAmount:2000,status:'UNPAID'}});
  await db!.account.create({data:{id:'ap',code:'21100',name:'AP',type:'LIABILITY',category:'CURRENT_LIABILITY'}});
  await db!.journalEntry.create({data:{entryNumber:'AP-SOURCE',entryDate:date,description:'Synthetic AP',referenceType:'PURCHASE_INVOICE',referenceId:'payable',status:'POSTED',isAutoGenerated:true,lines:{create:[{accountId:'inventory',debit:2000,credit:0},{accountId:'ap',debit:0,credit:2000}]}}});
  const settlement=await tenantContext.run(db!,()=>BarterSettlementService.create({invoiceId:'invoice',purchaseInvoiceId:'payable',barterAmount:'1154.4',barterDate:date,includeCashPayment:false,cashAmount:'0',notes:'Synthetic',idempotencyKey:'price-barter-synthetic'},actor));
  expect((await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}})).remainingAmount.toString()).toBe('0');
  await tenantContext.run(db!,()=>BarterSettlementService.void({settlementId:settlement.id,reason:'Synthetic void'},actor));expect((await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}})).remainingAmount.toString()).toBe('1154.4');
 });
 it('does not issue a duplicate supplementary invoice from repriced SO after price adjustment',async()=>{
  await post(await input('120'));await db!.salesOrderItem.update({where:{id:'source-item'},data:{unitPrice:150,subtotal:1665,taxAmount:165}});await db!.salesOrder.update({where:{id:'order'},data:{totalAmount:1665,taxAmount:165}});
  await expect(tenantContext.run(db!,()=>createDraftInvoiceFromOrder('order',actor))).rejects.toThrow(/ditagihkan dua kali/);
  await expect(tenantContext.run(db!,()=>createInvoice({salesOrderId:'order',invoiceDate:date,termOfPaymentDays:30},actor))).rejects.toThrow(/ditagihkan dua kali/);expect(await db!.invoice.count()).toBe(1);
 });
 it('uses two tenant clients without control DB fallback',async()=>{
  const other=client('postgresql://postgres@127.0.0.1:55469/polyflow_return_credit_tenant_test');
  try{const markers=await other.$queryRaw<{purpose:string}[]>`SELECT purpose FROM "PriceAdjustmentDisposableMarker"`;expect(markers[0].purpose).toBe('price-adjustment-synthetic-only');await resetReturnFixture(other,false);const data=await input();await expect(tenantContext.run(other,()=>postInvoicePriceAdjustment(data,actor))).rejects.toThrow(/berubah/);expect(await other.invoicePriceAdjustment.count()).toBe(0);}finally{await other.$disconnect();}
 });
 it('routes automatic return pricing to review after adjustment; explicit manual return uses new net/tax capacity',async()=>{
  await post(await input('120'));
  const automatic=await db!.$transaction(tx=>postReturnCreditInTransaction(tx,{returnId:'return-1',invoiceId:'invoice',postingDate:date,lines:[{returnItemId:'return-1-item',basisLineId:'basis'}]},actor));expect(automatic.status).toBe('REVIEW_REQUIRED');
  const invoice=await db!.invoice.findUniqueOrThrow({where:{id:'invoice'}});
  await db!.$transaction(tx=>postManualReturnCreditInTransaction(tx,{returnId:'return-1',invoiceId:'invoice',postingDate:date,totalAmount:'1154.4',taxAmount:'114.4',expectedRemaining:invoice.remainingAmount.toString(),reason:'Synthetic whole credit',evidence:'Synthetic source',confirmed:true},actor));
  const adjustment=await db!.invoicePriceAdjustment.findFirstOrThrow();await expect(tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({adjustmentId:adjustment.id,reversalDate:date,reason:'Synthetic correction'},actor))).rejects.toThrow(/dipakai/);
 });
 it('blocks paid increase reversal after cash consumes it',async()=>{
  await db!.invoice.update({where:{id:'invoice'},data:{paidAmount:1110,status:'PAID'}});const a=await post(await input('120'));
  await db!.account.create({data:{id:'cash',code:'11100',name:'Synthetic Cash',type:'ASSET',category:'CURRENT_ASSET'}});
  await db!.$transaction(tx=>recordCustomerPaymentInTransaction(tx,{invoiceId:'invoice',amount:44.4,paymentDate:date,method:'Cash'},'PAID-INCREASE',actor));
  await expect(tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({adjustmentId:a.id,reversalDate:date,reason:'Synthetic correction'},actor))).rejects.toThrow(/dipakai/);
 });
 it('rejects source ambiguity, invalid status, period, date, and unknown IDs',async()=>{
  const data=await input();await db!.fiscalPeriod.updateMany({data:{status:'CLOSED'}});await expect(post(data)).rejects.toThrow();await db!.fiscalPeriod.updateMany({data:{status:'OPEN'}});
  await expect(post({...data,postingDate:new Date('2099-01-01')})).rejects.toThrow();await expect(post({...data,invoiceId:'foreign'})).rejects.toThrow();
  await db!.invoice.update({where:{id:'invoice'},data:{status:'DRAFT'}});await expect(source()).rejects.toThrow();
  await db!.invoiceReturnBasisLine.deleteMany();await db!.invoice.update({where:{id:'invoice'},data:{status:'UNPAID'}});
  expect((await source()).sourceLabel).toContain('SO saat ini');
  await db!.salesOrderItem.update({where:{id:'source-item'},data:{unitPrice:999}});await expect(source()).rejects.toThrow();
 });
 it('retains reviewed original basis through reversal even if SO price later changes',async()=>{
  await db!.invoice.update({where:{id:'invoice'},data:{status:'DRAFT'}});await db!.invoiceReturnBasisLine.deleteMany();await db!.invoice.update({where:{id:'invoice'},data:{status:'UNPAID'}});
  const adjustment=await post(await input());await db!.salesOrderItem.update({where:{id:'source-item'},data:{unitPrice:999}});
  await tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({adjustmentId:adjustment.id,reversalDate:date,reason:'Synthetic correction'},actor));
  expect((await source()).items[0].netUnitPrice).toBe('100.000000');
 });
 it('rejects changed original item without a balance change since preview',async()=>{
  const data=await input();await db!.salesOrderItem.update({where:{id:'source-item'},data:{productVariantId:'variant'}});
  await db!.productVariant.update({where:{id:'variant'},data:{name:'Synthetic changed label'}});
  await expect(post(data)).rejects.toThrow(/berubah/);
 });
 it('does not backdate a replacement adjustment before its compensating reversal',async()=>{
  const adjustment=await post(await input());
  await tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({adjustmentId:adjustment.id,reversalDate:new Date('2026-09-19T00:00:00+07:00'),reason:'Synthetic correction'},actor));
  await expect(post(await input('80'))).rejects.toThrow(/riwayat penyesuaian/);
 });
 it('database rejects cache tampering, source identity edits and posted history deletion',async()=>{
  const adjustment=await post(await input());
  await expect(db!.invoice.update({where:{id:'invoice'},data:{priceAdjustmentAmount:0}})).rejects.toThrow(/cache/);
  await expect(db!.invoicePriceAdjustment.delete({where:{id:adjustment.id}})).rejects.toThrow(/deleted/);
  await expect(db!.invoice.update({where:{id:'invoice'},data:{totalAmount:2220}})).rejects.toThrow(/history/);
  await expect(db!.salesOrderItem.delete({where:{id:'source-item'}})).rejects.toThrow(/deleted/);
  await db!.customer.create({data:{id:'other-customer',name:'Synthetic other'}});
  await expect(db!.salesOrder.update({where:{id:'order'},data:{customerId:'other-customer'}})).rejects.toThrow(/history/);
 });
 it('retains exact retry semantics and rejects different instruction/reversal replay',async()=>{
  const data=await input(),adjustment=await post(data);await expect(post({...data,newNetUnitPrice:'80'})).rejects.toThrow(/berbeda/);
  const command={adjustmentId:adjustment.id,reversalDate:date,reason:'Synthetic correction'};
  await tenantContext.run(db!,()=>reverseInvoicePriceAdjustment(command,actor));expect((await tenantContext.run(db!,()=>reverseInvoicePriceAdjustment(command,actor))).id).toBe(adjustment.id);
  await expect(post(data)).rejects.toThrow(/sudah dibalik/);
  await expect(tenantContext.run(db!,()=>reverseInvoicePriceAdjustment({...command,reason:'Different reason'},actor))).rejects.toThrow(/berbeda/);
 });
 it('rolls back on audit failure and protects posted metadata/source journal',async()=>{
  const data=await input();await db!.$executeRawUnsafe(`CREATE FUNCTION reject_price_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'price audit failed'; END $$`);await db!.$executeRawUnsafe('CREATE TRIGGER reject_price_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION reject_price_audit()');
  try{await expect(post(data)).rejects.toThrow('price audit failed');expect(await db!.invoicePriceAdjustment.count()).toBe(0);}finally{await db!.$executeRawUnsafe('DROP TRIGGER reject_price_audit ON "AuditLog"');await db!.$executeRawUnsafe('DROP FUNCTION reject_price_audit()');}
  const result=await post(data);await expect(db!.invoicePriceAdjustment.update({where:{id:result.id},data:{reason:'Changed'}})).rejects.toThrow();await expect(db!.journalLine.updateMany({where:{journalEntryId:'source-journal'},data:{description:'Changed'}})).rejects.toThrow();
 });
});
