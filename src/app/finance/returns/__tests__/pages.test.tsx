// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ page: vi.fn(), detail: vi.fn() }));
vi.mock('@/actions/finance/sales-returns', () => ({ getFinanceSalesReturnPage: mocks.page, getFinanceSalesReturnDetail: mocks.detail }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); } }));
import FinanceReturnsPage from '../page';
import FinanceReturnDetailPage from '../[id]/page';
import { financeReturnGuidance, financeReturnStatuses } from '@/components/finance/returns/return-status';
import { getNavItemsForWorkspace } from '@/lib/navigation/registry';
import { PERMISSION_CATALOG } from '@/lib/auth/permission-catalog';

const row = { id: 'return-1', returnNumber: 'SR-TEST', returnDate: '2026-09-18T00:00:00Z', status: 'DRAFT', totalAmount: 300, customer: { name: 'Example Customer' }, salesOrder: { orderNumber: 'SO-TEST' } };

describe('Finance return read-only pages', () => {
    beforeEach(() => {
        mocks.page.mockResolvedValue({ success: true, data: { rows: [row], page: 1, totalPages: 2, total: 26 } });
        mocks.detail.mockResolvedValue({ success: true, data: { ...row, reason: 'OTHER', notes: 'Example note', deliveryOrder: null, returnLocation: { name: 'Returns' }, items: [{ id: 'item-1', productVariant: { skuCode: 'SKU-TEST', name: 'Example item' }, condition: 'GOOD', returnedQty: 3, unitPrice: 100 }] } });
    });

    it('lists drafts with correct links, guidance, and persistent pagination filters', async () => {
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({ status: 'DRAFT', search: 'SR' }) }));
        expect(screen.getByRole('link', { name: 'SR-TEST' }).getAttribute('href')).toBe('/finance/returns/return-1');
        expect(screen.getByRole('link', { name: 'Berikutnya' }).getAttribute('href')).toBe('/finance/returns?page=2&status=DRAFT&search=SR');
        expect(screen.getByText(/Menunggu konfirmasi/)).toBeTruthy();
        expect(screen.getByLabelText('Status operasional')).toBeTruthy();
        expect(screen.queryByRole('button', { name: /posting|terima item|konfirmasi retur/i })).toBeNull();
    });

    it('shows an empty list distinctly from failed loading', async () => {
        mocks.page.mockResolvedValue({ success: true, data: { rows: [], page: 1, totalPages: 1, total: 0 } });
        const view = render(await FinanceReturnsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByText('Tidak ada retur sesuai filter.')).toBeTruthy();
        view.unmount();
        mocks.page.mockResolvedValue({ success: false, error: 'denied' });
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert').textContent).toContain('tidak dapat dimuat');
        expect(screen.queryByText('Tidak ada retur sesuai filter.')).toBeNull();
    });

    it('shows previous page and null customer safely', async () => {
        mocks.page.mockResolvedValue({ success: true, data: { rows: [{ ...row, customer: null }], page: 2, totalPages: 2, total: 26 } });
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({ page: '2' }) }));
        expect(screen.getByRole('link', { name: 'Sebelumnya' }).getAttribute('href')).toBe('/finance/returns?page=1');
        expect(screen.getByText('Tanpa customer')).toBeTruthy();
    });

    it('renders detail as document values without Sales mutation controls', async () => {
        render(await FinanceReturnDetailPage({ params: Promise.resolve({ id: row.id }) }));
        expect(screen.getByText('SR-TEST')).toBeTruthy();
        expect(screen.getByText('SO-TEST')).toBeTruthy();
        expect(screen.getByText('SKU-TEST')).toBeTruthy();
        expect(screen.getByText(/Potongan invoice belum dapat/)).toBeTruthy();
        expect(screen.getByText('Nilai dokumen (bukan kredit terposting)')).toBeTruthy();
        expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('does not disguise authorization errors as missing records', async () => {
        mocks.detail.mockResolvedValue({ success: false, error: 'denied' });
        render(await FinanceReturnDetailPage({ params: Promise.resolve({ id: row.id }) }));
        expect(screen.getByRole('alert')).toBeTruthy();
        mocks.detail.mockResolvedValue({ success: true, data: null });
        await expect(FinanceReturnDetailPage({ params: Promise.resolve({ id: row.id }) })).rejects.toThrow('NOT_FOUND');
    });

    it('defines honest guidance for every operational status', () => {
        expect(financeReturnGuidance('CONFIRMED')).toContain('Belum mengurangi');
        expect(financeReturnGuidance('RECEIVED')).toContain('bukan bukti');
        expect(financeReturnGuidance('COMPLETED')).toContain('bukan bukti');
        expect(financeReturnGuidance('CANCELLED')).toContain('bukan pengurang');
        expect(Object.keys(financeReturnStatuses)).toHaveLength(5);
    });

    it('registers a dedicated Finance route and permission', () => {
        expect(getNavItemsForWorkspace('finance')).toContainEqual(expect.objectContaining({ href: '/finance/returns', owner: 'finance' }));
        expect(PERMISSION_CATALOG.find((node) => node.key === '/finance')?.children).toContainEqual({ key: '/finance/returns', label: 'Retur Penjualan' });
    });
});
