import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({access:vi.fn(),context:vi.fn(),sources:vi.fn(),receive:vi.fn(),revalidate:vi.fn()}));
vi.mock('@/lib/core/tenant',()=>({withTenant:(fn:unknown)=>fn}));
vi.mock('@/lib/core/prisma',()=>({getTenantDbFromContext:mocks.context}));
vi.mock('@/lib/auth/sales-access',()=>({requireSalesAccess:mocks.access,requireSalesApprover:vi.fn()}));
vi.mock('@/services/sales/return-receiving-service',()=>({getReturnShipmentSources:mocks.sources}));
vi.mock('@/services/sales/returns-service',()=>({SalesReturnService:{receiveReturn:mocks.receive}}));
vi.mock('next/cache',()=>({revalidatePath:mocks.revalidate}));
import { getSalesReturnShipmentSources, receiveSalesReturnAction } from '../sales-returns';
describe('Sales return receiving actions',()=>{
 beforeEach(()=>{
  vi.clearAllMocks(); mocks.access.mockResolvedValue({user:{id:'sales-user'}});mocks.context.mockReturnValue({tenant:'test'});
  mocks.sources.mockResolvedValue([]);mocks.receive.mockResolvedValue({id:'return',status:'RECEIVED'});
 });
 it('requires Sales permission even when the source query is called directly',async()=>{
  mocks.access.mockRejectedValue(new Error('unauthorized'));
  expect((await getSalesReturnShipmentSources('return')).success).toBe(false);
  expect((await receiveSalesReturnAction('return')).success).toBe(false);
  expect(mocks.sources).not.toHaveBeenCalled();expect(mocks.receive).not.toHaveBeenCalled();
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
