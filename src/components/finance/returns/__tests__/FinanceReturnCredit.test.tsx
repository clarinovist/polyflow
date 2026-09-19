// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
const mocks=vi.hoisted(()=>({post:vi.fn(),reverse:vi.fn(),refresh:vi.fn()}));
vi.mock('@/actions/finance/sales-returns',()=>({postFinanceSalesReturnCredit:mocks.post,reverseFinanceSalesReturnCredit:mocks.reverse}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
import { FinanceReturnCredit } from '../FinanceReturnCredit';
const row={id:'return',status:'RECEIVED',credit:null,items:[{id:'item',productVariantId:'variant',productVariant:{name:'Synthetic item'},condition:'GOOD',returnedQty:2,receipt:{restockValue:'120.00'}}],invoices:[{id:'invoice',invoiceNumber:'INV-TEST',status:'UNPAID',totalAmount:'1110.00',paidAmount:'0.00',creditedAmount:'0.00',remaining:'1110.00',basis:[{id:'basis',sourceItemId:'source',productVariantId:'variant',quantity:'10',availableQuantity:'10',netAmount:'1000.00',taxAmount:'110.00',discountAmount:'250.00'}]}]} as unknown as FinanceReturnDetail;
describe('Finance credit posting and compensation UI',()=>{
 beforeEach(()=>{vi.clearAllMocks();mocks.post.mockResolvedValue({success:true,data:{status:'POSTED'}});mocks.reverse.mockResolvedValue({success:true,data:{status:'REVERSED'}});});
 it('requires explicit allocation and preserves failures without false success/refresh',async()=>{
  render(<FinanceReturnCredit row={row}/>);
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
  render(<FinanceReturnCredit row={row}/>);fireEvent.change(screen.getByRole('spinbutton'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Posting kredit retur'}));
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
 it('keeps drafts non-mutating and missing snapshots honest',()=>{
  const view=render(<FinanceReturnCredit row={{...row,status:'DRAFT'}}/>);
  expect(screen.queryByRole('button')).toBeNull();view.unmount();
  render(<FinanceReturnCredit row={{...row,invoices:[]}}/>);
  expect(screen.getByRole('status').textContent).toContain('Tidak ada sumber');
 });
 it('uses WIB dates and requires a correction reason before compensation',async()=>{
  render(<FinanceReturnCredit row={{...row,credit:{status:'POSTED',totalAmount:'222.00',postedAt:'2026-09-17T17:00:00.000Z',reversedAt:null,reversalReason:null,reviewReason:null,allocations:[]}}}/>);
  expect(screen.getByText(/Posting: 2026-09-18/)).toBeTruthy();
  const button=screen.getByRole('button',{name:'Balikkan kredit — pulihkan piutang'});
  expect((button as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Alasan koreksi (minimal 5 karakter)'),{target:{value:'Synthetic correction'}});fireEvent.click(button);
  await waitFor(()=>expect(mocks.reverse).toHaveBeenCalledTimes(1));
 });
});
