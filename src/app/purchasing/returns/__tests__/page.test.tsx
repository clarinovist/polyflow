// @vitest-environment jsdom
import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({getPurchaseReturns:vi.fn()}));
vi.mock('@/actions/purchasing/purchase-returns',()=>({getPurchaseReturns:mocks.getPurchaseReturns}));
vi.mock('@/components/purchasing/PurchaseReturnTable',()=>({PurchaseReturnTable:({initialData}: {initialData:unknown[]})=>React.createElement('div',{'data-testid':'return-table'},String(initialData.length))}));
vi.mock('next/link',()=>({default:({children,href,...props}:React.ComponentProps<'a'>)=>React.createElement('a',{href,...props},children)}));
import PurchaseReturnsPage from '../page';
import {render,screen} from '@testing-library/react';
describe('Purchase returns honest query state',()=>{beforeEach(()=>vi.clearAllMocks());
 it('shows an alert rather than a zero-result dashboard when the query fails',async()=>{mocks.getPurchaseReturns.mockResolvedValue({success:false,error:'Layanan retur tidak tersedia',code:'INTERNAL_ERROR'});render(await PurchaseReturnsPage({searchParams:Promise.resolve({})}));expect(screen.getByRole('alert').textContent).toContain('Layanan retur tidak tersedia');expect(screen.queryByTestId('return-table')).toBeNull();});
 it('keeps a successful empty dataset distinct from failure',async()=>{mocks.getPurchaseReturns.mockResolvedValue({success:true,data:[]});render(await PurchaseReturnsPage({searchParams:Promise.resolve({})}));expect(screen.queryByRole('alert')).toBeNull();expect(screen.getByTestId('return-table').textContent).toBe('0');});
});
