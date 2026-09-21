// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import type { ComponentProps } from 'react';
import { StockAgingTable } from '../StockAgingTable';
afterEach(cleanup);
it('paginates aging without dropping search results on later pages', () => {
    const data = Array.from({ length: 51 }, (_, i) => ({ productVariantId: `p-${i}`, name: `Barang ${i}`, skuCode: `S-${i}`, totalStock: 10, totalValue: 100, buckets: { '0-30': { range: '0-30', count: 1, quantity: 10, value: 100 }, '31-60': { range: '31-60', count: 0, quantity: 0, value: 0 }, '61-90': { range: '61-90', count: 0, quantity: 0, value: 0 }, '90+': { range: '90+', count: 0, quantity: 0, value: 0 } } })) as ComponentProps<typeof StockAgingTable>['data'];
    render(<StockAgingTable data={data} />);
    expect(screen.getAllByRole('row')).toHaveLength(26);
    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }));
    expect(screen.getByText('Barang 25')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cari produk aging'), { target: { value: 'Barang 50' } });
    expect(screen.getByText('Barang 50')).toBeTruthy();
    expect(screen.getByText(/Halaman 1 dari 1/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Cari produk aging'), { target: { value: 'tidak-ada' } });
    expect(screen.getByText(/Tidak ada stok aging/)).toBeTruthy();
});
