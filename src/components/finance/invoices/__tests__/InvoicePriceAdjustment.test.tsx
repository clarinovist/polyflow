// @vitest-environment jsdom
import{fireEvent,render,screen,waitFor}from'@testing-library/react';import{beforeEach,describe,expect,it,vi}from'vitest';
const m=vi.hoisted(()=>({load:vi.fn(),post:vi.fn(),reverse:vi.fn(),refresh:vi.fn()}));vi.mock('@/actions/finance/invoice-price-adjustment',()=>({getInvoicePriceAdjustmentContext:m.load,postFinanceInvoicePriceAdjustment:m.post,reverseFinanceInvoicePriceAdjustment:m.reverse}));vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh})}));import{InvoicePriceAdjustment}from'../InvoicePriceAdjustment';
const data={invoiceId:'invoice',invoiceNumber:'INV-SYNTHETIC',remaining:'1110',sourceFingerprint:'a'.repeat(64),sourceLabel:'Snapshot invoice',sourceError:null,items:[{sourceItemId:'source',quantity:'10',availableQuantity:'10',netAmount:'1000',taxAmount:'110',netUnitPrice:'100',activeAdjustment:false}],history:[]};
describe('Finance price adjustment preview',()=>{
 beforeEach(()=>{vi.clearAllMocks();m.load.mockResolvedValue({success:true,data});m.post.mockResolvedValue({success:true,data:{id:'adjustment'}});});
 it('requires source/qty/new net price/reason/confirmation and previews signed tax and balance',async()=>{render(<InvoicePriceAdjustment invoiceId="invoice"/>);fireEvent.click(screen.getByText('Sesuaikan Harga'));await screen.findByText('INV-SYNTHETIC',{exact:false});fireEvent.change(screen.getByLabelText('Barang yang disesuaikan'),{target:{value:'source'}});fireEvent.change(screen.getByLabelText('Qty yang terdampak'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('Harga netto baru per unit (Rp, sebelum pajak)'),{target:{value:'90'}});expect(screen.getByText(/Sisa setelah penyesuaian/).textContent).toContain('1.087,80');expect(screen.getByRole('button',{name:'Konfirmasi & posting penyesuaian'})).toHaveProperty('disabled',true);fireEvent.change(screen.getByLabelText('Alasan penyesuaian / pembalikan'),{target:{value:'Synthetic agreement'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Konfirmasi & posting penyesuaian'}));await waitFor(()=>expect(m.post).toHaveBeenCalledOnce());expect(m.post).toHaveBeenCalledWith(expect.objectContaining({invoiceId:'invoice',sourceItemId:'source',quantity:'2',newNetUnitPrice:'90',confirmed:true}));});
 it('shows source failure instead of claiming invoice updated',async()=>{m.load.mockResolvedValue({success:false,error:'Sumber ambigu'});render(<InvoicePriceAdjustment invoiceId="invoice"/>);fireEvent.click(screen.getByText('Sesuaikan Harga'));expect((await screen.findByRole('alert')).textContent).toContain('ambigu');expect(m.post).not.toHaveBeenCalled();});
 it('shows one concise blocker and hides unusable adjustment fields when source validation fails',async()=>{
  m.load.mockResolvedValue({success:true,data:{...data,sourceLabel:'Pemeriksaan sumber diperlukan',sourceError:'Jurnal invoice tidak cocok dengan nilai asli. Rekonsiliasi dahulu.',items:[]}});
  render(<InvoicePriceAdjustment invoiceId="invoice"/>);
  fireEvent.click(screen.getByText('Sesuaikan Harga'));
  const alert=await screen.findByRole('alert');
  expect(alert.textContent).toContain('Penyesuaian belum tersedia');
  expect(alert.textContent).toContain('Jurnal invoice tidak cocok');
  expect(screen.queryByText('Pemeriksaan sumber diperlukan')).toBeNull();
  expect(screen.queryByLabelText('Barang yang disesuaikan')).toBeNull();
  expect(screen.queryByText(/Riwayat dan pembalikan tetap tersedia/i)).toBeNull();
  expect(m.post).not.toHaveBeenCalled();
 });
 it('keeps reversal controls available for posted history when the new source is blocked',async()=>{
  const history=[{id:'adjustment',status:'POSTED',totalAmount:'-100',reason:'Harga awal salah',postingDate:'2026-09-20T00:00:00.000Z',createdBy:{name:'Finance'}}];
  m.load.mockResolvedValue({success:true,data:{...data,sourceError:'Jurnal invoice tidak cocok.',items:[],history}});
  render(<InvoicePriceAdjustment invoiceId="invoice"/>);
  fireEvent.click(screen.getByText('Sesuaikan Harga'));
  fireEvent.click(await screen.findByRole('button',{name:'Balikkan penyesuaian'}));
  expect(screen.getByLabelText('Alasan penyesuaian / pembalikan')).toBeDefined();
  expect(screen.getByLabelText('Tanggal posting / pembalikan')).toBeDefined();
  expect(screen.getByRole('checkbox')).toBeDefined();
  expect(screen.queryByLabelText('Barang yang disesuaikan')).toBeNull();
 });
});
