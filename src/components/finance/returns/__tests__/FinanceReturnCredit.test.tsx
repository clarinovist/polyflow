// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
const mocks=vi.hoisted(()=>({post:vi.fn(),reverse:vi.fn(),refresh:vi.fn()}));
vi.mock('@/actions/finance/sales-returns',()=>({postFinanceSalesReturnCredit:mocks.post,reverseFinanceSalesReturnCredit:mocks.reverse}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('../ReturnCreditConfirmation',()=>({ReturnCreditConfirmation:()=> <div>Prepared proposal</div>}));
import { FinanceReturnCredit } from '../FinanceReturnCredit';
const row={id:'return',status:'RECEIVED',credit:null,items:[{id:'item',productVariantId:'variant',productVariant:{name:'Synthetic item'},condition:'GOOD',returnedQty:2,receipt:{restockValue:'120.00'}}],invoices:[{id:'invoice',invoiceNumber:'INV-TEST',status:'UNPAID',totalAmount:'1110.00',paidAmount:'0.00',creditedAmount:'0.00',remaining:'1110.00',basis:[{id:'basis',sourceItemId:'source',productVariantId:'variant',quantity:'10',availableQuantity:'10',netAmount:'1000.00',taxAmount:'110.00',discountAmount:'250.00'}]}]} as unknown as FinanceReturnDetail;
describe('Finance credit posting and compensation UI',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.post.mockResolvedValue({success:true,data:{status:'POSTED'}});mocks.reverse.mockResolvedValue({success:true,data:{status:'REVERSED'}});});
 it('requires explicit allocation and preserves failures without false success/refresh',async()=>{
  render(<FinanceReturnCredit row={row}/>);
  fireEvent.click(screen.getByText('Opsi lanjutan: alokasi snapshot per item'));
  expect((screen.getByRole('button',{name:'Posting kredit retur'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'2'}});
  mocks.post.mockResolvedValueOnce({success:false,error:'Periode ditutup'});
  fireEvent.click(screen.getByRole('button',{name:'Posting kredit retur'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Periode ditutup'));
  expect(mocks.refresh).not.toHaveBeenCalled();
  // The error may render before React commits the end of the async transition.
  const retryButton=screen.getByRole('button',{name:'Posting kredit retur'});
  await waitFor(()=>expect(retryButton).toHaveProperty('disabled',false));
  expect(mocks.post).toHaveBeenCalledTimes(1);
  fireEvent.click(retryButton);
  await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledTimes(1));
  expect(mocks.post).toHaveBeenCalledTimes(2);
  expect(mocks.post).toHaveBeenLastCalledWith(expect.objectContaining({returnId:'return',lines:[{returnItemId:'item',basisLineId:'basis',quantity:'2'}]}));
 });
 it('shows Finance review as unposted, not success',async()=>{
  mocks.post.mockResolvedValue({success:true,data:{status:'REVIEW_REQUIRED',reviewReason:'Invoice lunas; periksa Finance'}});
  render(<FinanceReturnCredit row={row}/>);fireEvent.click(screen.getByText('Opsi lanjutan: alokasi snapshot per item'));fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Posting kredit retur'}));
  await waitFor(()=>expect(screen.getByRole('alert').textContent).toContain('Invoice lunas'));
  expect(screen.queryByText('Kredit terposting. Pembayaran dan total invoice asli tidak berubah.')).toBeNull();
 });
 it.each(['DRAFT','CONFIRMED','CANCELLED'] as const)('keeps %s ineligible for credit posting',status=>{
  render(<FinanceReturnCredit row={{...row,status}}/>);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('spinbutton')).toBeNull();
  expect(screen.getByText(/Draft\/confirmed\/cancelled tidak mengurangi piutang/)).toBeTruthy();
  expect(mocks.post).not.toHaveBeenCalled();
 });
 it.each([
  {status:'PAID',remaining:'0.00',paidAmount:'1110.00',message:/tercatat lunas/i},
  {status:'DRAFT',remaining:'1110.00',paidAmount:'0.00',message:/belum diakui/i},
  {status:'PAID',remaining:'100.00',paidAmount:'1010.00',message:/tidak konsisten/i},
 ])('replaces dead-end forms with invoice inspection for $status / $remaining',({status,remaining,paidAmount,message})=>{
  render(<FinanceReturnCredit row={{...row,invoices:[{...row.invoices[0],status:status as FinanceReturnDetail['invoices'][number]['status'],remaining,paidAmount}]}}/>);
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.getByRole('link',{name:/Periksa invoice INV-TEST/}).getAttribute('href')).toBe('/finance/invoices/sales/invoice');
  expect(screen.queryByText('Prepared proposal')).toBeNull();
  expect(screen.queryByText('Opsi lanjutan: alokasi snapshot per item')).toBeNull();
  expect(screen.queryByText('Periksa atau ubah nominal secara manual')).toBeNull();
  if(status==='PAID' && remaining==='0.00') expect(screen.getByRole('button',{name:'Terbitkan saldo kredit'})).toBeTruthy();
  else expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(mocks.post).not.toHaveBeenCalled();
 });
 it('refreshes a blocked invoice and restores forms only when refreshed data has receivables',()=>{
  const view=render(<FinanceReturnCredit row={{...row,invoices:[{...row.invoices[0],status:'PAID',paidAmount:'1110.00',remaining:'0.00'}]}}/>);
  fireEvent.click(screen.getByRole('button',{name:'Muat ulang saldo invoice'}));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.post).not.toHaveBeenCalled();
  view.rerender(<FinanceReturnCredit row={row}/>);
  expect(screen.getByText('Prepared proposal')).toBeTruthy();
  expect(screen.queryByText(/Invoice tercatat lunas/)).toBeNull();
 });
 it('does not label a mix of draft and genuinely paid invoices as inconsistent',()=>{
  render(<FinanceReturnCredit row={{...row,invoices:[{...row.invoices[0],status:'DRAFT'}, {...row.invoices[0],id:'paid',status:'PAID',remaining:'0.00',paidAmount:'1110.00'}]}}/>);
  expect(screen.getByRole('status').textContent).toContain('Belum ada invoice dengan piutang');
  expect(screen.queryByText('Prepared proposal')).toBeNull();
 });
 it('does not offer paid snapshot lines alongside an eligible invoice',()=>{
  render(<FinanceReturnCredit row={{...row,invoices:[...row.invoices,{...row.invoices[0],id:'paid',status:'PAID',remaining:'0.00',paidAmount:'1110.00'}]}}/>);
  fireEvent.click(screen.getByText('Opsi lanjutan: alokasi snapshot per item'));
  expect(screen.getAllByRole('spinbutton')).toHaveLength(1);
 });
 it('keeps concise confirmation and manual fallback for unpaid historical invoice',()=>{
  render(<FinanceReturnCredit row={{...row,invoices:[{...row.invoices[0],basis:[]}]}}/>);
  expect(screen.getByText('Prepared proposal')).toBeTruthy();
  fireEvent.click(screen.getByText('Periksa atau ubah nominal secara manual'));
  expect(screen.getByRole('option',{name:/INV-TEST/})).toBeTruthy();
 });
 it('keeps drafts non-mutating and missing snapshots honest',()=>{
  const view=render(<FinanceReturnCredit row={{...row,status:'DRAFT'}}/>);
  expect(screen.queryByRole('button')).toBeNull();view.unmount();
  render(<FinanceReturnCredit row={{...row,invoices:[]}}/>);
  expect(screen.getByRole('status').textContent).toContain('Belum ada invoice');
  expect(screen.queryByText('Periksa atau ubah nominal secara manual')).toBeNull();
 });
 it('uses WIB dates and requires a correction reason before compensation',async()=>{
  render(<FinanceReturnCredit row={{...row,credit:{mode:'SNAPSHOT',approvalReason:null,evidenceReference:null,approvedAt:null,approvedBy:null,manualRemainingBefore:null,taxAmount:'22.00',status:'POSTED',totalAmount:'222.00',postedAt:'2026-09-17T17:00:00.000Z',reversedAt:null,reversalReason:null,reviewReason:null,allocations:[]}}}/>);
  expect(screen.getByText(/Posting: 2026-09-18/)).toBeTruthy();
  const button=screen.getByRole('button',{name:'Balikkan kredit — pulihkan piutang'});
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Alasan koreksi (minimal 5 karakter)'),{target:{value:'Synthetic correction'}});fireEvent.click(button);
  await waitFor(()=>expect(mocks.reverse).toHaveBeenCalledTimes(1));
 });
});
