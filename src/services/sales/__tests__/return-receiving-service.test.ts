import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
const mocks=vi.hoisted(()=>({context:vi.fn(),receive:vi.fn(),findUnique:vi.fn(),findMany:vi.fn(),raw:vi.fn()}));
vi.mock('@/lib/core/prisma',()=>({getTenantDbFromContext:mocks.context}));
vi.mock('@/services/finance/sales-return-receipt-service',()=>({receiveReturnInTransaction:mocks.receive}));
import { getReturnShipmentSources, receiveSalesReturn } from '../return-receiving-service';
const tx={salesReturn:{findUnique:mocks.findUnique},stockMovement:{findMany:mocks.findMany},$queryRaw:mocks.raw};
describe('Sales return receiving boundary',()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  mocks.context.mockReturnValue({$transaction:(fn:(tx:unknown)=>unknown)=>fn(tx)});
  mocks.findUnique.mockResolvedValue({id:'return',salesOrderId:'order',items:[{id:'item',productVariantId:'variant'}],deliveryOrder:null});
  mocks.findMany.mockResolvedValue([{id:'source',productVariantId:'variant',quantity:5,reference:'Shipment',createdAt:new Date('2026-09-18')}]);
  mocks.receive.mockResolvedValue({status:'RECEIVED'});
 });
 it('uses one unambiguous source and delegates all writes to the receipt transaction',async()=>{
  await receiveSalesReturn('return','actor');
  expect(mocks.receive).toHaveBeenCalledWith(tx,expect.objectContaining({returnId:'return',lines:[{returnItemId:'item',sourceMovementId:'source'}]}),'actor');
 });
 it('uses explicitly selected sources without guessing',async()=>{
  await receiveSalesReturn('return','actor',[{returnItemId:'item',sourceMovementId:'chosen'}]);
  expect(mocks.findMany).not.toHaveBeenCalled();
  expect(mocks.receive).toHaveBeenCalledWith(tx,expect.objectContaining({lines:[{returnItemId:'item',sourceMovementId:'chosen'}]}),'actor');
 });
 it('rejects absent tenant, missing return, empty or ambiguous shipment source',async()=>{
  mocks.context.mockReturnValueOnce(undefined);
  await expect(receiveSalesReturn('return','actor')).rejects.toThrow('Konteks tenant');
  mocks.findUnique.mockResolvedValueOnce(null);
  await expect(receiveSalesReturn('return','actor')).rejects.toThrow();
  mocks.findMany.mockResolvedValueOnce([]);
  await expect(receiveSalesReturn('return','actor')).rejects.toThrow('kosong/ambigu');
  mocks.findMany.mockResolvedValueOnce([{id:'a',productVariantId:'variant',quantity:1,createdAt:new Date()},{id:'b',productVariantId:'variant',quantity:1,createdAt:new Date()}]);
  await expect(receiveSalesReturn('return','actor')).rejects.toThrow('kosong/ambigu');
  expect(mocks.receive).not.toHaveBeenCalled();
 });
 it('bounds source discovery and narrows to the linked delivery',async()=>{
  mocks.findUnique.mockResolvedValue({salesOrderId:'order',items:[{id:'item',productVariantId:'variant'}],deliveryOrder:{orderNumber:'DO-TEST'}});
  await getReturnShipmentSources(tx as unknown as Prisma.TransactionClient,'return');
  expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({take:201,where:expect.objectContaining({salesOrderId:'order',reference:{endsWith:' via DO-TEST'}})}));
  mocks.findMany.mockResolvedValueOnce(Array(201).fill({}));
  await expect(getReturnShipmentSources(tx as unknown as Prisma.TransactionClient,'return')).rejects.toThrow('Terlalu banyak');
 });
});
