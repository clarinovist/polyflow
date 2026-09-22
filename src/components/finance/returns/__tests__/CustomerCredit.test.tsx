// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IssueCustomerCreditForm } from '../IssueCustomerCreditForm';
import { CustomerCreditDetail } from '../CustomerCreditDetail';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
import type { CustomerCreditDetail as Detail } from '@/services/finance/customer-credit-query-service';
const mocks=vi.hoisted(()=>({issue:vi.fn(),apply:vi.fn(),targets:vi.fn(),reverse:vi.fn(),push:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mocks.push,refresh:mocks.refresh})}));
vi.mock('@/actions/finance/sales-returns',()=>({issueFinanceCustomerCredit:mocks.issue,applyFinanceCustomerCredit:mocks.apply,getFinanceCustomerCreditTargets:mocks.targets,reverseFinanceCustomerCreditApplication:mocks.reverse,reverseFinanceCustomerCreditNote:mocks.reverse}));
vi.mock('../CustomerCreditIdentity',()=>({CustomerCreditIdentity:()=> <div>Identity approval</div>}));
const row={id:'r',status:'COMPLETED',totalAmount:222,customerCredit:null,credit:null,invoices:[{id:'i',invoiceNumber:'INV-SYNTHETIC',status:'PAID',totalAmount:'1110',paidAmount:'1110',creditedAmount:'0',priceAdjustmentAmount:'0',remaining:'0'}]} as unknown as FinanceReturnDetail;
const note={id:'n',customerId:'c',customer:'Synthetic',returnId:'r',returnNumber:'SR-SYNTHETIC',sourceInvoice:'INV-SOURCE',status:'POSTED',total:'222',remaining:'222',reason:'Accepted return',evidence:'Reviewed documents',postingDate:'2026-09-18T00:00:00Z',reversalReason:null,applications:[],links:[]} as Detail;
describe('customer credit UI',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.issue.mockResolvedValue({success:true,data:{id:'n'}});mocks.apply.mockResolvedValue({success:true,data:{id:'n'}});mocks.targets.mockResolvedValue({success:true,data:{truncated:false,rows:[{id:'target',orderNumber:'SO-TARGET',invoiceNumber:'INV-TARGET',customer:'Synthetic',remaining:'100'}]}});});
 it('requires explicit reviewed issuance and preserves invoice payments',async()=>{
  render(<IssueCustomerCreditForm row={row}/>);const button=screen.getByRole('button',{name:'Terbitkan saldo kredit'});expect(button).toHaveProperty('disabled',true);
  fireEvent.change(screen.getByLabelText('Invoice lunas sumber'),{target:{value:'i'}});fireEvent.change(screen.getByLabelText('Total saldo kredit (Rp)'),{target:{value:'222'}});fireEvent.change(screen.getByLabelText('Alasan persetujuan'),{target:{value:'Accepted damaged return'}});fireEvent.change(screen.getByLabelText('Referensi bukti invoice dan penerimaan'),{target:{value:'Invoice and receipt evidence'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
  await waitFor(()=>expect(mocks.push).toHaveBeenCalledWith('/finance/returns/credits/n'));
  expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({returnId:'r',invoiceId:'i',totalAmount:'222',confirmed:true}));
 });
 it('hides issuance for an already consumed return',()=>{
  render(<IssueCustomerCreditForm row={{...row,customerCredit:{id:'note',status:'POSTED'}}}/>);expect(screen.queryByRole('button')).toBeNull();
 });
 it('offers partial invoice settlement, retains credit balance and requires confirmation',async()=>{
  render(<CustomerCreditDetail note={note} canLink={false}/>);expect(screen.queryByText('Identity approval')).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Cari tagihan'}));
  await waitFor(()=>expect(screen.getByRole('option',{name:/SO-TARGET/})).toBeTruthy());fireEvent.change(screen.getByLabelText('Invoice tujuan'),{target:{value:'target'}});fireEvent.change(screen.getByLabelText('Kredit yang digunakan (Rp)'),{target:{value:'100'}});fireEvent.change(screen.getByLabelText('Alasan (minimal 10 karakter)'),{target:{value:'Settle target invoice'}});
  const button=screen.getByRole('button',{name:'Konfirmasi pemakaian kredit'});expect(button).toHaveProperty('disabled',true);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
  await waitFor(()=>expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({noteId:'n',invoiceId:'target',totalAmount:'100',expectedBalance:'222',expectedInvoiceBalance:'100',confirmed:true})));
  await waitFor(()=>expect(mocks.refresh).toHaveBeenCalled());expect(screen.getByRole('alert').textContent).toContain('tidak ada pembayaran kas');
 });
 it('does not post a failed application and exposes identity controls only to admin UI',async()=>{
  render(<CustomerCreditDetail note={note} canLink/>);expect(screen.getByText('Identity approval')).toBeTruthy();mocks.targets.mockResolvedValue({success:false,error:'No access'});fireEvent.click(screen.getByRole('button',{name:'Cari tagihan'}));await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('No access'));expect(mocks.apply).not.toHaveBeenCalled();
 });
});
