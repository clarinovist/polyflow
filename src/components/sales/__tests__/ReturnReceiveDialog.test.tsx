// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({load:vi.fn(),receive:vi.fn(),refresh:vi.fn(),success:vi.fn()}));
vi.mock('@/actions/sales/sales-returns',()=>({getSalesReturnShipmentSources:mocks.load,receiveSalesReturnAction:mocks.receive}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:mocks.refresh})}));
vi.mock('sonner',()=>({toast:{success:mocks.success}}));
import { ReturnReceiveDialog } from '../ReturnReceiveDialog';
describe('return shipment selection',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({success:true,data:[{returnItemId:'item',sources:[{id:'source',quantity:2,reference:'Synthetic shipment',createdAt:'2026-09-18'}]}]});
  mocks.receive.mockResolvedValue({success:true,data:{status:'RECEIVED'}});
 });
 it('requires source evidence and submits the chosen source',async()=>{
  render(<ReturnReceiveDialog returnId="return" items={[{id:'item',name:'SKU-TEST'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Terima Item'}));
  await screen.findByLabelText('SKU-TEST');
  fireEvent.click(screen.getByRole('button',{name:'Konfirmasi penerimaan'}));
  await waitFor(()=>expect(mocks.receive).toHaveBeenCalledWith('return',[{returnItemId:'item',sourceMovementId:'source'}]));
  expect(mocks.success).toHaveBeenCalled();
  expect(mocks.refresh).toHaveBeenCalled();
 });
 it('keeps failed action visible without success toast or refresh',async()=>{
  mocks.receive.mockResolvedValue({success:false,error:'Jurnal sumber hilang'});
  render(<ReturnReceiveDialog returnId="return" items={[{id:'item',name:'SKU-TEST'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Terima Item'}));
  await screen.findByLabelText('SKU-TEST');
  fireEvent.click(screen.getByRole('button',{name:'Konfirmasi penerimaan'}));
  expect((await screen.findByRole('alert')).textContent).toContain('Jurnal sumber hilang');
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it('clears old source choices when reloading fails',async()=>{
  render(<ReturnReceiveDialog returnId="return" items={[{id:'item',name:'SKU-TEST'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Terima Item'}));
  await screen.findByLabelText('SKU-TEST');
  mocks.load.mockResolvedValueOnce({success:false,error:'Sumber gagal dimuat'});
  fireEvent.click(screen.getByRole('button',{name:'Muat ulang sumber'}));
  await screen.findByRole('alert');
  expect(screen.getByRole('button',{name:'Konfirmasi penerimaan'})).toHaveProperty('disabled',true);
 });
 it('does not allow receiving when sources are missing',async()=>{
  mocks.load.mockResolvedValue({success:true,data:[{returnItemId:'item',sources:[]}]});
  render(<ReturnReceiveDialog returnId="return" items={[{id:'item',name:'SKU-TEST'}]}/>);
  fireEvent.click(screen.getByRole('button',{name:'Terima Item'}));
  await screen.findByText(/Sumber pengiriman tidak ditemukan/);
  expect(screen.getByRole('button',{name:'Konfirmasi penerimaan'})).toHaveProperty('disabled',true);
 });
});
