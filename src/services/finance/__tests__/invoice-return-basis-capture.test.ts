import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureInvoiceReturnBasis, refreshDraftInvoiceReturnBasis } from '../invoice-return-basis-capture';
import { snapshotFixture } from '@/lib/finance/__tests__/invoice-snapshot-fixture';
const D=(x:number)=>new Prisma.Decimal(x);
const mocks={$queryRaw:vi.fn(),invoice:{findUnique:vi.fn(),findMany:vi.fn()},journalEntry:{findMany:vi.fn()},invoiceReturnBasisLine:{findMany:vi.fn(),createMany:vi.fn(),deleteMany:vi.fn()},salesReturnCreditAllocation:{count:vi.fn()}};
const tx=mocks as unknown as Prisma.TransactionClient;
describe('capture original basis at invoice issuance only',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.salesReturnCreditAllocation.count.mockResolvedValue(0);
  mocks.invoice.findUnique.mockResolvedValue({id:'invoice',salesOrderId:'so',status:'DRAFT',creditedAmount:D(0),totalAmount:D(1110),roundingAmount:D(0),salesOrder:{shippingCost:D(0),deliveryOrders:[],items:[{id:'item',productVariantId:'variant',quantity:D(10),deliveredQty:D(10),unitPrice:D(125),discountPercent:D(20),taxPercent:D(11),ppnMode:'EXCLUDE'}]}});
  mocks.invoice.findMany.mockResolvedValue([]);
  mocks.invoiceReturnBasisLine.findMany.mockResolvedValue([]);
  mocks.journalEntry.findMany.mockResolvedValue([{id:'journal',status:'DRAFT',lines:[{account:{type:'LIABILITY'},debit:D(0),credit:D(110)}]}]);
 });
 it('uses invoice commercial snapshot for return basis even when current SO differs',async()=>{
  const invoice=await mocks.invoice.findUnique();
  mocks.invoice.findUnique.mockResolvedValue({...invoice,totalAmount:D(1000),roundingAmount:D(100),commercialSnapshot:snapshotFixture()});
  mocks.journalEntry.findMany.mockResolvedValue([{id:'journal',status:'DRAFT',lines:[{account:{type:'LIABILITY'},debit:D(0),credit:D(80)}]}]);
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('CAPTURED');
  expect(mocks.invoiceReturnBasisLine.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({productVariantId:'a',quantity:'80',netAmount:'800.00',taxAmount:'80.00',sourceEvidence:expect.objectContaining({commercialSnapshotVersion:1,shippingAmount:'20.00'})})]});
  expect(mocks.invoice.findMany).not.toHaveBeenCalled();
 });
 it('does not invent returnable goods for a shipping-only supplementary invoice',async()=>{
  const invoice=await mocks.invoice.findUnique();
  mocks.invoice.findUnique.mockResolvedValue({...invoice,commercialSnapshot:snapshotFixture({items:[],shippingAmount:'50.00',commercialTotal:'50.00',taxAmount:'0.00'})});
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('REVIEW_REQUIRED');
  expect(mocks.invoiceReturnBasisLine.createMany).not.toHaveBeenCalled();
 });
 it('rejects mismatching journal rather than capturing inconsistent new evidence',async()=>{
  const invoice=await mocks.invoice.findUnique();
  mocks.invoice.findUnique.mockResolvedValue({...invoice,totalAmount:D(1000),roundingAmount:D(100),commercialSnapshot:snapshotFixture()});
  await expect(captureInvoiceReturnBasis(tx,'invoice')).rejects.toThrow();
  expect(mocks.invoiceReturnBasisLine.createMany).not.toHaveBeenCalled();
 });
 it('captures exact original line net and tax without master lookups',async()=>{
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('CAPTURED');
  expect(mocks.invoiceReturnBasisLine.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({invoiceId:'invoice',sourceItemId:'item',productVariantId:'variant',quantity:'10',netAmount:'1000.00',taxAmount:'110.00',discountAmount:'250.00',sourceJournalId:'journal'})]});
 });
 it('refreshes only an uncredited draft and rejects recognized or allocated basis',async()=>{
  await refreshDraftInvoiceReturnBasis(tx,'invoice');
  expect(mocks.invoiceReturnBasisLine.deleteMany).toHaveBeenCalledWith({where:{invoiceId:'invoice'}});
  mocks.invoice.findUnique.mockResolvedValueOnce({status:'PAID',creditedAmount:D(0)});
  await expect(refreshDraftInvoiceReturnBasis(tx,'invoice')).rejects.toThrow('tidak boleh');
  mocks.salesReturnCreditAllocation.count.mockResolvedValueOnce(1);
  await expect(refreshDraftInvoiceReturnBasis(tx,'invoice')).rejects.toThrow('sudah dipakai');
 });
 it('never overwrites an existing snapshot',async()=>{
  mocks.invoiceReturnBasisLine.findMany.mockResolvedValue([{id:'existing'}]);
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('EXISTS');
  expect(mocks.invoiceReturnBasisLine.createMany).not.toHaveBeenCalled();
 });
 it('captures only the residual original quantities and cents for a supplementary invoice',async()=>{
  const invoice=await mocks.invoice.findUnique();
  mocks.invoice.findUnique.mockResolvedValue({...invoice,totalAmount:D(666)});
  mocks.invoice.findMany.mockResolvedValue([{id:'older',totalAmount:D(444),roundingAmount:D(0),returnBasisLines:[{sourceItemId:'item',productVariantId:'variant',quantity:D(4),netAmount:D(400),taxAmount:D(44),discountAmount:D(100),sourceEvidence:{version:1,capturedAtInvoiceCreation:true,shippingAmount:'0.00'}}]}]);
  mocks.journalEntry.findMany.mockResolvedValue([{id:'journal',status:'DRAFT',lines:[{account:{type:'LIABILITY'},debit:D(0),credit:D(66)}]}]);
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('CAPTURED');
  expect(mocks.invoiceReturnBasisLine.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({quantity:'6',netAmount:'600.00',taxAmount:'66.00',discountAmount:'150.00'})]});
 });
 it('leaves supplemental invoices without sufficient original quantity evidence for review',async()=>{
  mocks.invoice.findMany.mockResolvedValue([{id:'older'}]);
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('REVIEW_REQUIRED');
  expect(mocks.invoiceReturnBasisLine.createMany).not.toHaveBeenCalled();
 });
 it('does not invent a snapshot when invoice journal differs from source lines',async()=>{
  mocks.journalEntry.findMany.mockResolvedValue([{id:'journal',status:'DRAFT',lines:[{account:{type:'LIABILITY'},debit:D(0),credit:D(99)}]}]);
  expect(await captureInvoiceReturnBasis(tx,'invoice')).toBe('REVIEW_REQUIRED');
  expect(mocks.invoiceReturnBasisLine.createMany).not.toHaveBeenCalled();
 });
});
