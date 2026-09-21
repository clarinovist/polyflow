// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ inventory: vi.fn(), locations: vi.fn(), products: vi.fn(), movements: vi.fn() }));
vi.mock('@/actions/inventory/inventory', () => ({ getInventoryStats: mocks.inventory, getLocations: mocks.locations, getProductVariants: mocks.products, getStockMovements: mocks.movements }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/components/warehouse/inventory/TransferForm', () => ({ TransferForm: () => <div>transfer-form</div> }));
vi.mock('@/components/warehouse/inventory/AdjustmentForm', () => ({ AdjustmentForm: () => <div>adjustment-form</div> }));
vi.mock('@/components/warehouse/inventory/QuickStockCheck', () => ({ QuickStockCheck: () => null }));
vi.mock('@/components/warehouse/inventory/HistoryDateFilter', () => ({ HistoryDateFilter: () => null }));
import TransferPage from '../transfer/page';
import AdjustmentPage from '../adjustment/page';
import HistoryPage from '../history/page';
beforeEach(() => { vi.clearAllMocks(); Object.values(mocks).forEach((fn) => fn.mockResolvedValue({ success: true, data: [] })); });
afterEach(cleanup);
describe('inventory read/load states', () => {
    it.each([TransferPage, AdjustmentPage])('does not render a usable mutation form on load failure', async (Page) => {
        mocks.inventory.mockResolvedValue({ success: false });
        render(await Page());
        expect(screen.getByRole('alert').textContent).toContain('Form belum dapat digunakan');
        expect(screen.queryByText(/-form$/)).toBeNull();
    });
    it('explains recent transfer subset rather than asserting no transfers exist', async () => {
        render(await TransferPage());
        expect(screen.getByText('transfer-form')).toBeTruthy();
        expect(screen.getByText(/Maksimal 5 transfer dari 10 mutasi/)).toBeTruthy();
        expect(screen.getByText(/Tidak ada transfer dalam mutasi yang dimuat/)).toBeTruthy();
    });
    it('shows history cap and distinguishes failure from empty', async () => {
        render(await HistoryPage({ searchParams: Promise.resolve({ from: '2026-09-01' }) }));
        expect(mocks.movements).toHaveBeenCalledWith(500, expect.any(Date), undefined);
        expect(screen.getByText(/Maksimal 500/)).toBeTruthy();
        cleanup();
        mocks.movements.mockResolvedValue({ success: false });
        render(await HistoryPage({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert').textContent).toContain('Gagal memuat mutasi');
        expect(screen.queryByText('Tidak ada mutasi stok ditemukan.')).toBeNull();
    });
});
