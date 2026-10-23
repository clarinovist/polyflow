// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ page: vi.fn(), detail: vi.fn() }));
vi.mock('@/actions/finance/sales-returns', () => ({ getFinanceSalesReturnPage: mocks.page, getFinanceSalesReturnDetail: mocks.detail }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, useRouter: () => ({ refresh: vi.fn() }) }));
import FinanceReturnsPage from '../page';
import FinanceReturnDetailPage from '../[id]/page';
import { financeReturnGuidance, financeReturnStatuses } from '@/components/finance/returns/return-status';
import { getNavItemsForWorkspace } from '@/lib/navigation/registry';
import { PERMISSION_CATALOG } from '@/lib/auth/permission-catalog';

const row = { id: 'return-1', returnNumber: 'SR-TEST', returnDate: '2026-09-18T00:00:00Z', status: 'DRAFT', totalAmount: 300, customer: { name: 'Example Customer' }, salesOrder: { orderNumber: 'SO-TEST' }, credit: null, customerCredit: null };

describe('Finance return read-only pages', () => {
    beforeEach(() => {
        mocks.page.mockResolvedValue({ success: true, data: { rows: [row], page: 1, totalPages: 2, total: 26 } });
        mocks.detail.mockResolvedValue({ success: true, data: { ...row, invoices: [], credit: null, reason: 'OTHER', notes: 'Example note', deliveryOrder: null, returnLocation: { name: 'Returns' }, items: [{ id: 'item-1', productVariant: { skuCode: 'SKU-TEST', name: 'Example item' }, condition: 'GOOD', returnedQty: 3, unitPrice: 100 }] } });
    });

    it('lists drafts with correct links, guidance, and persistent pagination filters', async () => {
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({ status: 'DRAFT', search: 'SR' }) }));
        expect(screen.getByRole('link', { name: 'SR-TEST' }).getAttribute('href')).toBe('/finance/returns/return-1');
        expect(screen.getByRole('link', { name: 'Berikutnya' }).getAttribute('href')).toBe('/finance/returns?page=2&status=DRAFT&search=SR');
        expect(screen.getByText('Menunggu konfirmasi di Penjualan.')).toBeTruthy();
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
        expect(screen.getByText('Belum mengurangi piutang')).toBeTruthy();
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

    it('uses server-wide stage counts and preserves stage/search/status across pagination', async () => {
        mocks.page.mockResolvedValue({ success: true, data: { rows: [row], page: 2, totalPages: 3, total: 55, stageCounts: { ALL: 90, REVIEW: 55, READY: 2, AWAITING_GOODS: 20, DRAFT: 3, POSTED: 8, BALANCE: 1, CANCELLED: 1 } } });
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({ page: '2', search: 'SR', status: 'COMPLETED', stage: 'REVIEW' }) }));
        expect(mocks.page).toHaveBeenCalledWith({ page: '2', search: 'SR', status: 'COMPLETED', stage: 'REVIEW' });
        expect(screen.getByRole('link', { name: 'Perlu dicek 55' }).getAttribute('aria-current')).toBe('page');
        expect(screen.getByRole('link', { name: 'Terposting 8' }).getAttribute('href')).toBe('/finance/returns?page=1&status=COMPLETED&search=SR&stage=POSTED');
        expect(screen.getByRole('link', { name: 'Semua 90' }).getAttribute('href')).toBe('/finance/returns?page=1&status=COMPLETED&search=SR');
        expect(screen.getByRole('link', { name: 'Berikutnya' }).getAttribute('href')).toContain('stage=REVIEW');
        expect(document.querySelector('input[name="stage"]')?.getAttribute('value')).toBe('REVIEW');
        expect(screen.getByRole('columnheader', { name: 'Status' })).toBeTruthy();
        expect(screen.getByRole('columnheader', { name: 'Kredit piutang' })).toBeTruthy();
    });

    it('keeps primary zero-count chips and reveals secondary chips only when relevant or selected', async () => {
        mocks.page.mockResolvedValue({ success: true, data: { rows: [], page: 1, totalPages: 1, total: 0, stageCounts: { ALL: 0, REVIEW: 0, READY: 0, AWAITING_GOODS: 0, DRAFT: 0, POSTED: 0, BALANCE: 0, CANCELLED: 0 } } });
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({ stage: 'CANCELLED' }) }));
        expect(screen.getByRole('link', { name: 'Perlu dicek 0' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Menunggu barang 0' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Terposting 0' })).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Dibatalkan 0' }).getAttribute('aria-current')).toBe('page');
        expect(screen.queryByRole('link', { name: 'Saldo kredit 0' })).toBeNull();
    });

    it('does not show fake zero counts or an empty list when the stage request fails', async () => {
        mocks.page.mockResolvedValue({ success: false, error: 'Invalid stage' });
        render(await FinanceReturnsPage({ searchParams: Promise.resolve({ stage: 'invalid' }) }));
        expect(mocks.page).toHaveBeenCalledWith(expect.objectContaining({ stage: 'invalid' }));
        expect(screen.getByRole('alert')).toBeTruthy();
        expect(screen.queryByRole('link', { name: 'Semua 0' })).toBeNull();
        expect(screen.queryByRole('table')).toBeNull();
    });

    it('keeps absent receipt evidence distinct from zero HPP', async () => {
        render(await FinanceReturnDetailPage({ params: Promise.resolve({ id: row.id }) }));
        expect(screen.getByLabelText('Bukti penerimaan belum tersedia').textContent).toBe('—');
        expect(screen.getByText('HPP terima')).toBeTruthy();
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
