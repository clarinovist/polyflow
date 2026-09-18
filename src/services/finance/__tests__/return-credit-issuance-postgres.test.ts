import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { actor, date, resetReturnFixture, returnTestClient } from './return-credit-postgres-fixture';
vi.mock('@/services/accounting/account-resolver',()=>({resolveAccount:async(role:string)=>({id:role==='accounts-receivable'?'ar':role==='vat-output'?'vat':role==='sales-rounding-income'?'rounding':'revenue'})}));
vi.mock('@/services/accounting/tenant-revenue-rule-service',()=>({loadActiveTenantRevenueRules:async()=>[]}));
import { tenantContext } from '@/lib/core/prisma';
import { createInvoice, createDraftInvoiceFromOrder } from '../invoice-lifecycle-service';
const connection=process.env.RETURN_CREDIT_TEST_DATABASE_URL;
// This file runs independently; same database suites must be run serially during local QA.
const db=connection?returnTestClient(connection):null;
describe.skipIf(!db)('return basis through actual invoice issuance on PostgreSQL',()=>{
    beforeEach(async()=>{
        await resetReturnFixture(db!);
        await db!.invoice.update({where:{id:'invoice'},data:{status:'DRAFT'}});
        await db!.invoiceReturnBasisLine.deleteMany();
        await db!.journalEntry.delete({where:{id:'source-journal'}});
        await db!.invoice.delete({where:{id:'invoice'}});
        await db!.salesOrder.update({where:{id:'order'},data:{taxAmount:110}});
        await db!.account.create({data:{id:'rounding',code:'41999',name:'Rounding Income',type:'REVENUE',category:'OTHER_REVENUE'}});
    });
    afterAll(async()=>{await db?.$disconnect();});
    it('captures original quantities and tax in the same issuance transaction',async()=>{
        const invoice=await tenantContext.run(db!,()=>createInvoice({salesOrderId:'order',invoiceDate:date,termOfPaymentDays:30},actor));
        const basis=await db!.invoiceReturnBasisLine.findMany({where:{invoiceId:invoice.id}});
        expect(basis).toHaveLength(1);
        expect(basis[0].quantity.toString()).toBe('10');
        expect(basis[0].taxAmount.toString()).toBe('110');
        expect(invoice.totalAmount.toString()).toBe('1500');
    });
    it('concurrent manual issuance cannot duplicate the same delivered value',async()=>{
        const run=()=>tenantContext.run(db!,()=>createInvoice({salesOrderId:'order',invoiceDate:date,termOfPaymentDays:30},actor));
        const outcomes=await Promise.allSettled([run(),run()]);
        expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
        expect(await db!.invoice.count()).toBe(1);
        expect(await db!.invoiceReturnBasisLine.count()).toBe(1);
    });
    it('supplementary invoice captures residual quantities after a partial invoice is recognized',async()=>{
        await db!.salesOrderItem.update({where:{id:'source-item'},data:{deliveredQty:4}});
        await db!.salesOrder.update({where:{id:'order'},data:{totalAmount:444,taxAmount:44}});
        const first=await tenantContext.run(db!,()=>createInvoice({salesOrderId:'order',invoiceDate:date,termOfPaymentDays:30},actor));
        await db!.salesOrderItem.update({where:{id:'source-item'},data:{deliveredQty:10}});
        await db!.salesOrder.update({where:{id:'order'},data:{totalAmount:1110,taxAmount:110}});
        const second=await tenantContext.run(db!,()=>createDraftInvoiceFromOrder('order',actor));
        expect(second?.id).not.toBe(first.id);
        const basis=await db!.invoiceReturnBasisLine.findMany({where:{invoiceId:second!.id}});
        expect(basis).toHaveLength(1);
        expect(basis[0].quantity.toString()).toBe('6');
        expect(basis[0].netAmount.toString()).toBe('600');
        expect(basis[0].taxAmount.toString()).toBe('66');
    });
});
