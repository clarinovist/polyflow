import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ShippedWeightCard } from '../ShippedWeightCard';

const stats = {
    shippedWeightKg: 12345.678,
    shippedOrderCount: 3,
    unconvertedItemCount: 0,
    incompleteOrderCount: 0,
};

describe('ShippedWeightCard', () => {
    it('shows Indonesian kg formatting, unique orders, partial shipments and gross definition', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={stats} />);
        expect(html).toContain('Total Berat Terkirim');
        expect(html).toContain('12.345,68 kg');
        expect(html).toContain('Dari 3 order');
        expect(html).toContain('termasuk kirim parsial');
        expect(html).toContain('belum dikurangi retur');
        expect(html).not.toContain('belum lengkap');
    });

    it('shows 0 kg only for a successful empty result', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={{ ...stats, shippedWeightKg: 0, shippedOrderCount: 0 }} />);
        expect(html).toContain('0 kg');
        expect(html).not.toContain('belum tersedia');
    });

    it('shows unavailable rather than 0 kg when fetching fails', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={null} />);
        expect(html).toContain('—');
        expect(html).toContain('Data berat belum tersedia');
        expect(html).not.toContain('0 kg');
    });

    it('labels a subtotal explicitly when some units cannot be converted', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={{ ...stats, unconvertedItemCount: 2 }} />);
        expect(html).toContain('Berat tercatat (belum lengkap)');
        expect(html).toContain('2 baris barang belum dapat dihitung dalam kg.');
        expect(html).not.toContain('Rincian pengiriman');
    });

    it('labels missing legacy DO detail and never presents it as a complete total', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={{ ...stats, shippedWeightKg: 0, incompleteOrderCount: 1 }} />);
        expect(html).toContain('Berat tercatat (belum lengkap)');
        expect(html).toContain('Rincian pengiriman 1 order belum lengkap.');
    });
});
