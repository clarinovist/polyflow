// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ProductionOrdersPage from '../page';
import {
    getProductionOrdersList,
    getProductionOrderStats,
} from '@/actions/production/production-orders';

vi.mock('@/actions/production/production-orders', () => ({
    getProductionOrdersList: vi.fn(),
    getProductionOrderStats: vi.fn(),
}));
vi.mock('@/components/production/ProductionOrderViews', () => ({
    ProductionOrderViews: () => <nav>Daftar / Board Proses</nav>,
}));
vi.mock('@/components/support/contextual-help', () => ({
    ContextualHelp: () => null,
}));

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.mocked(getProductionOrdersList)
        .mockReset()
        .mockResolvedValue({ orders: [], total: 0, page: 1, pageSize: 25 });
    vi.mocked(getProductionOrderStats).mockResolvedValue({
        totalOrders: 48,
        activeCount: 12,
        draftCount: 18,
        lateCount: 3,
    });
});

describe('SPK list redesign', () => {
    it('keeps ALL in the submitted search rather than reverting to hidden completed orders', async () => {
        render(
            await ProductionOrdersPage({
                searchParams: Promise.resolve({
                    status: 'ALL',
                    category: 'packing',
                    q: 'contoh',
                    page: '2',
                }),
            }),
        );
        const select = screen.getByLabelText('Status') as HTMLSelectElement;
        const data = new FormData(select.closest('form')!);
        expect(data.get('status')).toBe('ALL');
        expect(data.get('category')).toBe('packing');
        expect(data.get('q')).toBe('contoh');
        expect(data.has('page')).toBe(false);
        expect(getProductionOrdersList).toHaveBeenCalledWith(
            expect.objectContaining({
                excludeCompleted: undefined,
                bomCategories: ['PACKING'],
                page: 2,
            }),
        );
        expect(
            screen.getByRole('link', { name: 'Mixing' }).getAttribute('href'),
        ).toContain('status=ALL');
        expect(
            screen.getByRole('link', { name: 'Mixing' }).getAttribute('href'),
        ).not.toContain('page=');
    });
    it('explicitly hides only completed by default and describes the global aggregate truthfully', async () => {
        render(
            await ProductionOrdersPage({ searchParams: Promise.resolve({}) }),
        );
        expect(getProductionOrdersList).toHaveBeenCalledWith(
            expect.objectContaining({ excludeCompleted: true }),
        );
        expect(
            (screen.getByLabelText('Status') as HTMLSelectElement).value,
        ).toBe('');
        expect(screen.getByText('Belum dimulai')).toBeTruthy();
        expect(
            screen.getByText('Draft + Siap Produksi + Menunggu Bahan'),
        ).toBeTruthy();
        expect(screen.queryByText('Siap Dirilis')).toBeNull();
        expect(screen.getByText('Selesai disembunyikan')).toBeTruthy();
        expect(screen.queryByText(/SPK dibatalkan tetap ditampilkan/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Info filter daftar SPK' }));
        expect((await screen.findByRole('tooltip')).textContent).toContain('SPK dibatalkan tetap ditampilkan');
    });
    it('preserves late search and STANDARD extrusion mapping', async () => {
        render(
            await ProductionOrdersPage({
                searchParams: Promise.resolve({
                    late: '1',
                    category: 'extrusion',
                }),
            }),
        );
        expect(getProductionOrdersList).toHaveBeenCalledWith(
            expect.objectContaining({
                bomCategories: ['EXTRUSION', 'STANDARD'],
                late: true,
                excludeCompleted: undefined,
            }),
        );
        const data = new FormData(
            screen.getByLabelText('Status').closest('form')!,
        );
        expect(data.get('late')).toBe('1');
    });
    it('renders six aligned columns with actual base units and the entered target snapshot', async () => {
        vi.mocked(getProductionOrdersList).mockResolvedValue({
            total: 26,
            page: 1,
            pageSize: 25,
            orders: [
                {
                    id: 'test-order',
                    orderNumber: 'WO-TEST',
                    plannedQuantity: 500,
                    actualQuantity: 200,
                    plannedEnteredQuantity: 20,
                    plannedEnteredUnit: 'BAL',
                    plannedConversionFactorSnapshot: 25,
                    plannedStartDate: new Date('2026-09-23T00:00:00Z'),
                    status: 'IN_PROGRESS',
                    priority: 'NORMAL',
                    isMaklon: false,
                    machine: { code: 'PACK-01' },
                    salesOrder: null,
                    bom: {
                        name: 'Resep sintetis',
                        productVariant: {
                            name: 'Produk sintetis',
                            primaryUnit: 'KG',
                            salesUnit: 'BAL',
                            conversionFactor: 99,
                        },
                    },
                },
            ],
        } as never);
        render(
            await ProductionOrdersPage({ searchParams: Promise.resolve({}) }),
        );
        expect(screen.getAllByRole('columnheader')).toHaveLength(6);
        expect(screen.getByText('200 / 500 KG')).toBeTruthy();
        expect(screen.getByText('Target: 20 BAL (500 KG)')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Lihat detail WO-TEST' })
                .getAttribute('href'),
        ).toBe('/production/orders/test-order');
        expect(
            (
                screen.getByRole('button', {
                    name: 'Sebelumnya',
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        expect(
            screen
                .getByRole('link', { name: 'Berikutnya' })
                .getAttribute('href'),
        ).toContain('page=2');
    });
});
