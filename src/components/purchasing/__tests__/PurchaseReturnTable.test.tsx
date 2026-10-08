// @vitest-environment jsdom
import {render,screen,within} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {describe,expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
import {PurchaseReturnTable} from '../PurchaseReturnTable';
type Row=ComponentProps<typeof PurchaseReturnTable>['initialData'][number];
const row={id:'pr-1',returnNumber:'PR-SYNTHETIC-0001',returnDate:new Date('2026-10-01T00:00:00Z'),status:'DRAFT',totalAmount:125000,supplier:{id:'sup-1',name:'Supplier Sintetis'},purchaseOrder:{orderNumber:'PO-SYN-1'},_count:{items:2}} as Row;
describe('PurchaseReturnTable detail affordance',()=>{
 it('renders native named links on desktop and mobile',()=>{const {container}=render(<PurchaseReturnTable initialData={[row]}/>);const links=screen.getAllByRole('link',{name:'Lihat Detail PR-SYNTHETIC-0001'});expect(links).toHaveLength(2);for(const link of links){expect(link.getAttribute('href')).toBe('/purchasing/returns/pr-1');link.focus();expect(document.activeElement).toBe(link);}const mobile=container.querySelector('[aria-label="Daftar retur pembelian mobile"]') as HTMLElement;expect(within(mobile).getByText('Lihat Detail')).toBeTruthy();});
 it('preserves a supplied basePath and empty state',()=>{const {rerender}=render(<PurchaseReturnTable initialData={[row]} basePath="/alternate/returns"/>);for(const link of screen.getAllByRole('link',{name:'Lihat Detail PR-SYNTHETIC-0001'}))expect(link.getAttribute('href')).toBe('/alternate/returns/pr-1');rerender(<PurchaseReturnTable initialData={[]}/>);expect(screen.queryAllByRole('link')).toHaveLength(0);expect(screen.getAllByText(/retur/i).length).toBeGreaterThan(0);});
});
