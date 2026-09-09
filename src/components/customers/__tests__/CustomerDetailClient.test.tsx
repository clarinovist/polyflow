// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { CustomerDetailClient, type SerializedCustomer } from '../CustomerDetailClient';
import { installHistoryIntegration } from '@/components/shared/partner-detail/__tests__/navigation-mock';

const { edit, orders, prices, barter } = vi.hoisted(() => ({ edit: vi.fn(), orders: vi.fn(), prices: vi.fn(), barter: vi.fn() }));
vi.mock('next/navigation', async () => {
    const { useTestSearchParams } = await import('@/components/shared/partner-detail/__tests__/navigation-mock');
    return { useSearchParams: useTestSearchParams };
});
vi.mock('../CustomerDialog', () => ({ CustomerDialog: (props: ComponentProps<typeof import('../CustomerDialog').CustomerDialog>) => { edit(props); return props.trigger; } }));
vi.mock('@/components/sales/SalesOrderTable', () => ({ SalesOrderTable: (props: unknown) => { orders(props); return <div>Order content</div>; } }));
vi.mock('../CustomerProductPricesManager', () => ({ CustomerProductPricesManager: (props: unknown) => { prices(props); return <div>Price content</div>; } }));
vi.mock('../CustomerBarterSettings', () => ({ CustomerBarterSettings: (props: unknown) => { barter(props); return <div>Barter content</div>; } }));
vi.mock('../360/CustomerInvoicesTab', () => ({ CustomerInvoicesTab: ({ customerId }: { customerId: string }) => <div>Invoice {customerId}</div> }));
vi.mock('../360/CustomerReturnsTab', () => ({ CustomerReturnsTab: () => <div>Retur content</div> }));
vi.mock('../360/CustomerDeliveriesTab', () => ({ CustomerDeliveriesTab: () => <div>Delivery content</div> }));
vi.mock('../360/CustomerQuotationsTab', () => ({ CustomerQuotationsTab: () => <div>Quotation content</div> }));
vi.mock('../360/CustomerVisitsTab', () => ({ CustomerVisitsTab: () => <div>Visit content</div> }));
vi.mock('../360/CustomerAnalyticsTab', () => ({ CustomerAnalyticsTab: () => <div>Analytics content</div> }));

const customer = {
    id: 'customer-1', name: 'Customer Contoh', code: 'CUS-1', isActive: true,
    email: 'customer@example.test', phone: '123', billingAddress: 'Alamat tagihan contoh',
    shippingAddress: 'Alamat kirim contoh', taxId: 'TAX-1', paymentTermDays: 14,
    creditLimit: 500000, discountPercent: 2, maxDiscountPercent: 5,
    notes: 'Catatan customer', latitude: -6, longitude: 107,
    province: 'Provinsi contoh', city: 'Kota contoh', district: 'Kecamatan contoh', village: 'Desa contoh',
    photoUrl: null,
} as SerializedCustomer;
const baseProps: ComponentProps<typeof CustomerDetailClient> = {
    customer, salesOrders: [], customerProductPrices: [], products: [],
};
function show(tab = 'overview', props: Partial<typeof baseProps> = {}) {
    window.history.replaceState(null, '', `/sales/customers/customer-1?tab=${tab}`);
    return render(<CustomerDetailClient {...baseProps} {...props} />);
}
const choose = (name: string) => fireEvent.mouseDown(screen.getByRole('tab', { name }), { button: 0, ctrlKey: false });
beforeEach(() => { vi.clearAllMocks(); installHistoryIntegration(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('customer detail workspace', () => {
    it('renders five groups, real existing history/analytics and unchanged edit payload', () => {
        show();
        expect(within(screen.getByRole('tablist', { name: 'Bagian detail' })).getAllByRole('tab')).toHaveLength(5);
        expect(screen.getByRole('heading', { name: 'Customer Contoh' })).toBeDefined();
        expect(screen.getByRole('link', { name: 'Daftar customer' }).getAttribute('href')).toBe('/sales/customers');
        expect(screen.getByRole('button', { name: 'Edit profil' })).toBeDefined();
        expect(orders).toHaveBeenCalledWith({ initialData: baseProps.salesOrders });
        expect(edit.mock.lastCall?.[0].initialData).toEqual(customer);
        expect(edit.mock.lastCall?.[0].mode).toBe('edit');
        expect(screen.getByText('Analytics content')).toBeDefined();
        expect(screen.queryByText(/Data ilustrasi|jatuh tempo/i)).toBeNull();
    });

    it('keeps all profile details and maps link while changing tabs', () => {
        show();
        const toggle = screen.getByRole('button', { name: 'Profil customer' });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        const profile = screen.getByRole('complementary', { name: 'Profil customer' });
        for (const text of ['customer@example.test', '123', 'Alamat tagihan contoh', 'Alamat kirim contoh', 'TAX-1', '14 Hari', 'Rp 500.000', '2%', 'Catatan customer', 'Belum ada foto']) {
            expect(within(profile).getByText(text)).toBeDefined();
        }
        expect(within(profile).getByText('Desa contoh, Kecamatan contoh, Kota contoh, Provinsi contoh')).toBeDefined();
        const map = within(profile).getByRole('link', { name: 'Navigasi' });
        expect(map.getAttribute('href')).toBe('https://www.google.com/maps?q=-6,107');
        expect(map.getAttribute('rel')).toBe('noopener noreferrer');
        choose('Transaksi');
        choose('Pengiriman');
        expect(screen.getByText('Delivery content')).toBeDefined();
        expect(within(profile).getByText('Catatan customer')).toBeDefined();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        fireEvent.click(toggle);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it.each([
        ['history', 'Transaksi', 'Order content'], ['deliveries', 'Transaksi', 'Delivery content'],
        ['returns', 'Transaksi', 'Retur content'], ['quotations', 'Transaksi', 'Quotation content'],
        ['invoices', 'Keuangan', 'Invoice customer-1'], ['prices', 'Harga Produk', 'Price content'],
        ['visits', 'Aktivitas', 'Visit content'], ['analytics', 'Aktivitas', 'Analytics content'],
    ])('opens %s and selects its group', (tab, group, content) => {
        show(tab);
        expect(screen.getByText(content)).toBeDefined();
        expect(screen.getByRole('tab', { name: group }).getAttribute('aria-selected')).toBe('true');
    });

    it('keeps barter gated by existing prop and displays it only in finance', () => {
        const settings = { partner: null, candidates: [] };
        show('overview', { barterSettings: settings });
        expect(barter).not.toHaveBeenCalled();
        choose('Keuangan');
        expect(barter).toHaveBeenCalledWith({ customerId: customer.id, initialValue: settings });
        expect(screen.getByText('Barter content')).toBeDefined();
    });

    it('does not mount barter without the authorized server prop', () => {
        show('invoices');
        expect(barter).not.toHaveBeenCalled();
        expect(screen.queryByText('Barter content')).toBeNull();
    });

    it('passes existing product arrays to the manager through the overview shortcut', () => {
        show();
        fireEvent.click(screen.getByRole('button', { name: /Harga produk/ }));
        expect(prices).toHaveBeenCalledWith({ customerId: customer.id, prices: baseProps.customerProductPrices, products: baseProps.products });
        expect(window.location.search).toBe('?tab=prices');
    });

    it('handles empty profile without invented values and preserves edit normalization', () => {
        show('not-valid', { customer: {
            ...customer, code: null, isActive: false, email: null, phone: null, billingAddress: null,
            shippingAddress: null, taxId: null, paymentTermDays: 0, creditLimit: null,
            discountPercent: 0, notes: null, latitude: null, longitude: null,
            province: null, city: null, district: null, village: null,
        } });
        fireEvent.click(screen.getByRole('button', { name: 'Profil customer' }));
        expect(screen.getByText('Tanpa Kode')).toBeDefined();
        expect(screen.getByText('Nonaktif')).toBeDefined();
        expect(screen.getAllByText('Belum diisi')).toHaveLength(2);
        expect(screen.queryByRole('link', { name: 'Navigasi' })).toBeNull();
        expect(screen.queryByText('Catatan')).toBeNull();
        expect(screen.getByText('Sekilas hubungan bisnis')).toBeDefined();
        expect(edit.mock.lastCall?.[0].initialData).toMatchObject({ creditLimit: null, discountPercent: null, latitude: null, longitude: null });
    });

    it('renders an existing photo with meaningful alt text', () => {
        show('overview', { customer: { ...customer, photoUrl: '/store-test.png' } });
        fireEvent.click(screen.getByRole('button', { name: 'Profil customer' }));
        expect(screen.getByRole('img', { name: 'Foto toko Customer Contoh' }).getAttribute('src')).toBe('/store-test.png');
        expect(screen.queryByText('Belum ada foto')).toBeNull();
    });
});
