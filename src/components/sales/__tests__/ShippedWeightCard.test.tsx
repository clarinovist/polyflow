// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippedWeightCard } from '../ShippedWeightCard';

const stats = {
    shippedWeightKg: 12345.678,
    shippedOrderCount: 3,
    unconvertedItemCount: 0,
    incompleteOrderCount: 0,
};
beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ShippedWeightCard', () => {
    it('keeps the default card concise without hiding the value or order count', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={stats} />);
        expect(html).toContain('Total Berat Terkirim');
        expect(html).toContain('12.345,68 kg');
        expect(html).toContain('Dari 3 order');
        expect(html).toContain('Info total berat terkirim');
        expect(html).not.toContain('termasuk kirim parsial');
        expect(html).not.toContain('belum dikurangi retur');
        expect(html).not.toContain('Belum lengkap');
    });

    it('shows definitions and order-date scope after opening the info button', async () => {
        render(<ShippedWeightCard stats={stats} />);
        fireEvent.click(screen.getByRole('button', { name: 'Info total berat terkirim' }));
        const tooltip = await screen.findByRole('tooltip');
        expect(tooltip.textContent).toContain('termasuk kirim parsial');
        expect(tooltip.textContent).toContain('belum dikurangi retur');
        expect(tooltip.textContent).toContain('bukan berdasarkan tanggal pengiriman');
    });

    it('shows 0 kg only for a successful empty result', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={{ ...stats, shippedWeightKg: 0, shippedOrderCount: 0 }} />);
        expect(html).toContain('0 kg');
        expect(html).not.toContain('belum tersedia');
    });

    it('keeps unavailable visible rather than 0 kg when fetching fails', () => {
        const html = renderToStaticMarkup(<ShippedWeightCard stats={null} />);
        expect(html).toContain('—');
        expect(html).toContain('Data berat belum tersedia');
        expect(html).not.toContain('0 kg');
    });

    it('keeps an incomplete warning visible and moves unconvertible-item details into info', async () => {
        render(<ShippedWeightCard stats={{ ...stats, unconvertedItemCount: 2 }} />);
        expect(screen.getByText('Belum lengkap')).toBeTruthy();
        expect(screen.queryByText(/2 baris barang/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info total berat terkirim' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('2 baris barang belum dapat dihitung dalam kg.');
    });

    it('keeps an incomplete warning for missing legacy details and explains it in info', async () => {
        render(<ShippedWeightCard stats={{ ...stats, shippedWeightKg: 0, incompleteOrderCount: 1 }} />);
        expect(screen.getByText('Belum lengkap')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Info total berat terkirim' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('Rincian pengiriman 1 order belum lengkap.');
    });
});
