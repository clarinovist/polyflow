import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),context:vi.fn(),sources:vi.fn(),receive:vi.fn(),confirm:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/core/tenant',()=>({withTenant:(fn:unknown)=>fn}));
vi.mock('@/lib/core/prisma',()=>({getTenantDbFromContext:mocks.context}));
vi.mock('@/lib/auth/sales-access',()=>({requireSalesAccess:mocks.access,requireSalesApprover:vi.fn()}));
vi.mock('@/services/sales/return-receiving-service',()=>({getReturnShipmentSources:mocks.sources}));
vi.mock('@/services/sales/returns-service',()=>({SalesReturnService:{receiveReturn:mocks.receive,confirmReturn:mocks.confirm}}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
import { confirmSalesReturnAction, getSalesReturnShipmentSources, receiveSalesReturnAction } from '../sales-returns';
describe('Sales return receiving actions',()=>{
 beforeEach(()=>{
  vi.clearAllMocks(); mocks.access.mockResolvedValue({user:{id:'sales-user'}});mocks.context.mockReturnValue({tenant:'test'});
  mocks.sources.mockResolvedValue([]);mocks.receive.mockResolvedValue({id:'return',status:'RECEIVED'});
 });
 it('requires Sales permission even when the source query is called directly',async()=>{
  mocks.access.mockRejectedValue(new Error('unauthorized'));
  expect((await confirmSalesReturnAction('return')).success).toBe(false);
  expect((await getSalesReturnShipmentSources('return')).success).toBe(false);
  expect((await receiveSalesReturnAction('return')).success).toBe(false);
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.sources).not.toHaveBeenCalled();expect(mocks.receive).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it('confirms through the existing Sales guard and preserves service failures',async()=>{
  mocks.confirm.mockResolvedValueOnce({id:'return',status:'CONFIRMED'});
  expect((await confirmSalesReturnAction('return')).success).toBe(true);
  expect(mocks.confirm).toHaveBeenCalledWith('return','sales-user');
  expect(mocks.revalidate).toHaveBeenCalledWith('/sales/returns/return');
  mocks.revalidate.mockClear();mocks.confirm.mockRejectedValueOnce(new Error('Only DRAFT returns can be confirmed'));
  expect((await confirmSalesReturnAction('return')).success).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it('requires tenant context and validates lookup input',async()=>{
  mocks.context.mockReturnValueOnce(undefined);
  expect((await getSalesReturnShipmentSources('return')).success).toBe(false);
  expect((await getSalesReturnShipmentSources('')).success).toBe(false);
  expect(mocks.sources).not.toHaveBeenCalled();
 });
 it('forwards explicit source choices and refreshes only after success',async()=>{
  const lines=[{returnItemId:'item',sourceMovementId:'source'}];
  expect((await receiveSalesReturnAction('return',lines)).success).toBe(true);
  expect(mocks.receive).toHaveBeenCalledWith('return','sales-user',lines);
  expect(mocks.revalidate).toHaveBeenCalledWith('/sales/returns/return');
  mocks.revalidate.mockClear();mocks.receive.mockRejectedValueOnce(new Error('HPP missing'));
  expect((await receiveSalesReturnAction('return',lines)).success).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
 });
});
