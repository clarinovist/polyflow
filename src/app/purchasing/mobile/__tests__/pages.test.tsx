// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PurchasingHome from '../page';
import PurchasingTasks from '../tasks/page';
import PurchasingInsights from '../insights/page';
import PurchasingRequestDetail from '../requests/[id]/page';
import PurchasingOrderDetail from '../orders/[id]/page';
import PurchasingReceiptDetail from '../receipts/[id]/page';

const m = vi.hoisted(() => ({
    overview: vi.fn(),
    request: vi.fn(),
    order: vi.fn(),
    receipt: vi.fn(),
    notFound: vi.fn(),
    refresh: vi.fn(),
}));

vi.mock('@/actions/purchasing/mobile-dashboard', () => ({
    getPurchasingMobileOverview: m.overview,
    getPurchasingMobileRequestDetail: m.request,
    getPurchasingMobileOrderDetail: m.order,
    getPurchasingMobileReceiptDetail: m.receipt,
}));
vi.mock('next/navigation', () => ({
    notFound: m.notFound,
    useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

const overview = {
    generatedAt: '2026-10-07T03:00:00.000Z',
    filter: 'ALL',
    highlights: {
        pendingRequestCount: 1,
        draftPoCount: 1,
        waitingReceiptCount: 1,
        etaExceptionCount: 1,
        suggestedReorderCount: 1,
        overdueApCount: 2,
    },
    queue: {
        total: 4,
        returned: 1,
        items: [
            {
                id: 'po-1',
                kind: 'RECEIPT',
                title: 'PO-SYNTH',
                subtitle: 'Supplier Synthetic',
                status: 'ETA_TERLEWAT',
                priority: 'URGENT',
                href: '/purchasing/mobile/receipts/po-1',
                sortAt: '2026-10-01T00:00:00.000Z',
            },
        ],
    },
    suggestedReorder: {
        total: 1,
        returned: 1,
        items: [
            {
                id: 'variant-1',
                name: 'Bahan Synthetic',
                skuCode: 'RM-SYNTH',
                unit: 'KG',
                supplierName: null,
                totalStock: 5,
                reorderPoint: 20,
                reorderQuantity: 50,
            },
        ],
    },
};

beforeEach(() => {
    vi.resetAllMocks();
    m.overview.mockResolvedValue({ success: true, data: overview });
});
afterEach(cleanup);

describe('Purchasing Mobile enrichment pages', () => {
    it.each([
        ['home', () => PurchasingHome()],
        ['tasks', () => PurchasingTasks({ searchParams: Promise.resolve({}) })],
        ['insights', () => PurchasingInsights()],
    ])('%s renders one H1 and no mutation controls', async (_name, load) => {
        render(await load());
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: /approve|setuju|ubah|terima/i })).toBeNull();
    });

    it('uses URL filters with one current filter and total versus sample copy', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: { ...overview, filter: 'ETA' },
        });
        render(
            await PurchasingTasks({
                searchParams: Promise.resolve({ filter: 'ETA' }),
            }),
        );
        const nav = screen.getByRole('navigation', {
            name: 'Filter antrean purchasing',
        });
        const current = screen
            .getAllByRole('link')
            .filter(
                (link) =>
                    link.closest('nav') === nav &&
                    link.getAttribute('aria-current') === 'page',
            );
        expect(current).toHaveLength(1);
        expect(current[0].textContent).toContain('ETA lewat');
        expect(screen.getByText(/Menampilkan 1 dari 4 exception/)).toBeTruthy();
    });

    it('keeps amount absent from the UI when server DTO omits it', async () => {
        render(await PurchasingHome());
        expect(screen.queryByText(/^Rp/)).toBeNull();
        cleanup();
        render(await PurchasingInsights());
        expect(screen.queryByText(/^Rp/)).toBeNull();
    });

    it('renders amount only when present in the server DTO', async () => {
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                highlights: { ...overview.highlights, overdueApAmount: 750 },
            },
        });
        render(await PurchasingInsights());
        expect(screen.getByText((content) => content.replace(/ /g, ' ') === 'Rp 750')).toBeTruthy();
    });

    it('distinguishes expected read failure from empty data', async () => {
        m.overview.mockResolvedValue({ success: false });
        render(await PurchasingTasks({ searchParams: Promise.resolve({}) }));
        expect(screen.getByRole('alert').textContent).toContain(
            'Antrean purchasing belum tersedia',
        );
        expect(screen.queryByText('Tidak ada exception')).toBeNull();

        cleanup();
        m.overview.mockResolvedValue({
            success: true,
            data: {
                ...overview,
                queue: { total: 0, returned: 0, items: [] },
            },
        });
        render(await PurchasingTasks({ searchParams: Promise.resolve({}) }));
        expect(
            screen.getByText('Tidak ada exception pada filter ini'),
        ).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('renders request detail read-only with minimum item fields', async () => {
        m.request.mockResolvedValue({
            success: true,
            data: {
                kind: 'REQUEST',
                id: 'pr-1',
                number: 'PR-SYNTH',
                status: 'OPEN',
                priority: 'HIGH',
                requestedAt: '2026-10-07T00:00:00.000Z',
                createdByName: 'Planner Synthetic',
                reviewedByName: null,
                items: [{ id: 'line-1', name: 'Bahan', skuCode: 'RM', quantity: 4, unit: 'KG' }],
            },
        });
        render(await PurchasingRequestDetail({ params: Promise.resolve({ id: 'pr-1' }) }));
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByText('4 KG')).toBeTruthy();
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('renders order amounts only when present in the server DTO', async () => {
        const detail = {
            kind: 'ORDER',
            id: 'po-1',
            number: 'PO-SYNTH',
            status: 'DRAFT',
            supplierName: 'Supplier',
            orderedAt: '2026-10-07T00:00:00.000Z',
            expectedAt: null,
            items: [{
                id: 'line-1', name: 'Bahan', skuCode: 'RM',
                quantity: 2, receivedQuantity: 0, unit: 'KG',
            }],
        };
        m.order.mockResolvedValue({ success: true, data: detail });
        render(await PurchasingOrderDetail({ params: Promise.resolve({ id: 'po-1' }) }));
        expect(screen.queryByText(/^Rp/)).toBeNull();

        cleanup();
        m.order.mockResolvedValue({
            success: true,
            data: {
                ...detail,
                totalAmount: 500,
                items: [{ ...detail.items[0], unitPrice: 250, subtotal: 500 }],
            },
        });
        render(await PurchasingOrderDetail({ params: Promise.resolve({ id: 'po-1' }) }));
        expect(screen.getAllByText((content) => content.includes('Rp'))).toHaveLength(3);
    });

    it('does not invent a desktop link for a missing compact detail', async () => {
        m.order.mockResolvedValue({ success: false, code: 'NOT_FOUND' });
        await PurchasingOrderDetail({ params: Promise.resolve({ id: 'missing' }) });
        expect(m.notFound).toHaveBeenCalledOnce();
    });

    it('renders receipt progress without amount fields', async () => {
        m.receipt.mockResolvedValue({
            success: true,
            data: {
                kind: 'RECEIPT',
                id: 'po-1',
                number: 'PO-SYNTH',
                status: 'PARTIAL_RECEIVED',
                supplierName: 'Supplier',
                expectedAt: null,
                latestReceiptAt: null,
                receiptCount: 1,
                items: [{
                    id: 'line-1', name: 'Bahan', skuCode: 'RM',
                    orderedQuantity: 10, receivedQuantity: 4,
                    remainingQuantity: 6, unit: 'KG',
                }],
            },
        });
        render(await PurchasingReceiptDetail({ params: Promise.resolve({ id: 'po-1' }) }));
        expect(screen.getByText('6 KG')).toBeTruthy();
        expect(screen.queryByText(/^Rp/)).toBeNull();
    });
});

void PurchasingOrderDetail;
