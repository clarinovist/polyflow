// @vitest-environment jsdom
import React from 'react';import {render,screen} from '@testing-library/react';import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({open:vi.fn(),closed:vi.fn(),table:vi.fn()}));
vi.mock('@/actions/inventory/deliveries',()=>({getOpenDeliveryOrders:m.open,getClosedDeliveryOrders:m.closed}));
vi.mock('@/components/sales/DeliveryOrderTable',()=>({DeliveryOrderTable:(props:unknown)=>{m.table(props);return <div data-testid="table"/>}}));
vi.mock('@/components/common/url-transaction-date-filter',()=>({UrlTransactionDateFilter:()=> <button>Periode</button>}));vi.mock('next/link',()=>({default:({children,href,...p}:React.ComponentProps<'a'>)=><a href={href} {...p}>{children}</a>}));
import ActivePage from '../page';import HistoryPage from '../history/page';
const activeRow={id:'open',status:'LOADING',orderNumber:'SJ-OPEN',deliveryDate:'2026-10-08',salesOrderId:'so',salesOrder:{orderNumber:'SO',customer:{name:'C'}},sourceLocation:{name:'G'}};const closedRow={...activeRow,id:'closed',status:'DELIVERED',orderNumber:'SJ-CLOSED'};
describe('warehouse outgoing compatibility',()=>{beforeEach(()=>{vi.clearAllMocks();m.open.mockResolvedValue({success:true,data:[activeRow]});m.closed.mockResolvedValue({success:true,data:[closedRow]});});
 it('keeps active queue semantics and warehouse basePath',async()=>{render(await ActivePage());expect(m.open).toHaveBeenCalledOnce();expect(m.table).toHaveBeenCalledWith(expect.objectContaining({basePath:'/warehouse/outgoing',mode:'active',initialData:[expect.objectContaining({status:'LOADING'})]}));});
 it('keeps history server-filtered by period and closed-only',async()=>{render(await HistoryPage({searchParams:Promise.resolve({startDate:'2026-10-01T00:00:00Z',endDate:'2026-10-31T23:59:59Z'})}));expect(m.closed).toHaveBeenCalledWith({startDate:new Date('2026-10-01T00:00:00Z'),endDate:new Date('2026-10-31T23:59:59Z')});expect(m.table).toHaveBeenCalledWith(expect.objectContaining({basePath:'/warehouse/outgoing',mode:'history',initialData:[expect.objectContaining({status:'DELIVERED'})]}));});
 it.each([['active',ActivePage,m.open],['history',()=>HistoryPage({searchParams:Promise.resolve({})}),m.closed]] as const)('shows %s query failure as alert, not empty',async(_label,loader,query)=>{query.mockResolvedValueOnce({success:false,error:'DB gagal',code:'INTERNAL_ERROR'});render(await loader());expect(screen.getByRole('alert').textContent).toContain('DB gagal');expect(screen.queryByTestId('table')).toBeNull();});
});
