// @vitest-environment jsdom
import {fireEvent,render,screen,within} from '@testing-library/react';
import type {ComponentProps} from 'react';
import {describe,expect,it} from 'vitest';
import {GoodsReceiptTable} from '../GoodsReceiptTable';
type Receipt=ComponentProps<typeof GoodsReceiptTable>['receipts'][number];
const receipt:Receipt={id:'gr-1',receiptNumber:'GR-SYNTHETIC-IDENTIFIER-WITH-A-VERY-LONG-SUFFIX',receivedDate:new Date('2026-10-01T00:00:00Z'),notes:null,isMaklon:false,purchaseOrder:{orderNumber:'PO-SYN-1',status:'SENT',supplier:{name:'Supplier Sintetis Dengan Nama Sangat Panjang'}},customer:null,items:[{id:'item-1',receivedQty:25,productVariant:{name:'Produk Sintetis',skuCode:'SKU-SYN',primaryUnit:'KG'}}],location:{name:'Gudang Sintetis Dengan Nama Sangat Panjang'},createdBy:{name:'Fixture'},_count:{items:1}};
describe('GoodsReceiptTable responsive access',()=>{
 it.each(['/warehouse/incoming','/maklon/receipts','/warehouse/maklon/receipts'])('keeps the same semantic detail link on desktop and mobile for %s',(basePath)=>{render(<GoodsReceiptTable receipts={[receipt]} basePath={basePath}/>);const links=screen.getAllByRole('link',{name:/GR-SYNTHETIC/});expect(links).toHaveLength(2);for(const link of links){expect(link.getAttribute('href')).toBe(basePath+'/gr-1');link.focus();expect(document.activeElement).toBe(link);}});
 it('keeps long content in a bounded mobile representation and preserves search/empty state',()=>{const {container}=render(<GoodsReceiptTable receipts={[receipt]}/>);const mobile=container.querySelector('[aria-label="Daftar penerimaan barang mobile"]') as HTMLElement;expect(mobile).toBeTruthy();expect(within(mobile).getByText(receipt.receiptNumber)).toBeTruthy();fireEvent.change(screen.getByLabelText('Cari penerimaan barang'),{target:{value:'tidak-ada'}});expect(within(mobile).getByText(/tidak ditemukan/i)).toBeTruthy();});
});
