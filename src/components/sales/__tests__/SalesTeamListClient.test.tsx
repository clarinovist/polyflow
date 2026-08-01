// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SalesTeamListClient } from '../SalesTeamListClient';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const { mockGetSalesTeamAction, mockToast } = vi.hoisted(() => ({
    mockGetSalesTeamAction: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/sales/sales-team', () => ({
    getSalesTeamAction: (...args: unknown[]) =>
        mockGetSalesTeamAction(...args),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

function renderComponent() {
    return render(<SalesTeamListClient />);
}

describe('SalesTeamListClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetSalesTeamAction.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'u1',
                    name: 'Budi',
                    email: 'budi@test.com',
                    role: 'SALES',
                    roles: ['SALES'],
                    activeCustomerCount: 5,
                },
                {
                    id: 'u2',
                    name: 'Sari',
                    email: 'sari@test.com',
                    role: 'MARKETING',
                    roles: ['MARKETING'],
                    activeCustomerCount: 3,
                },
            ],
        });
    });

    it('renders search input', () => {
        renderComponent();
        expect(screen.getByPlaceholderText('Cari nama atau email...')).toBeDefined();
    });

    it('renders sales team members after loading', async () => {
        renderComponent();
        await waitFor(() => {
            expect(screen.getAllByText('Budi').length).toBeGreaterThan(0);
            expect(screen.getAllByText('Sari').length).toBeGreaterThan(0);
        });
    });

    it('displays active customer count', async () => {
        renderComponent();
        await waitFor(() => {
            expect(screen.getAllByText('5').length).toBeGreaterThan(0);
            expect(screen.getAllByText('3').length).toBeGreaterThan(0);
        });
    });

    it('shows Lihat Customer buttons', async () => {
        renderComponent();
        await waitFor(() => {
            const buttons = screen.getAllByText('Lihat Customer');
            expect(buttons.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('filters members by search', async () => {
        renderComponent();
        await waitFor(() => {
            expect(screen.getAllByText('Budi').length).toBeGreaterThan(0);
        });
        fireEvent.change(screen.getByPlaceholderText('Cari nama atau email...'), {
            target: { value: 'Budi' },
        });
        expect(screen.getAllByText('Budi').length).toBeGreaterThan(0);
        expect(screen.queryAllByText('Sari')).toHaveLength(0);
    });

    it('shows empty state when no members found', async () => {
        mockGetSalesTeamAction.mockResolvedValue({
            success: true,
            data: [],
        });
        renderComponent();
        await waitFor(() => {
            const emptyTexts = screen.getAllByText('Tidak ada data sales ditemukan.');
            expect(emptyTexts.length).toBeGreaterThan(0);
        });
    });

    it('opens dialog when Lihat Customer clicked', async () => {
        renderComponent();
        await waitFor(() => {
            expect(screen.getAllByText('Budi').length).toBeGreaterThan(0);
        });
        const buttons = screen.getAllByText('Lihat Customer');
        fireEvent.click(buttons[0]);
        await waitFor(() => {
            expect(screen.getByText('Customer - Budi')).toBeDefined();
        });
    });
});
