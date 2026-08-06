// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const { mockToast, mockSummaryAction, mockGetCustomerByIdAction, mockGetVehicles } = vi.hoisted(
    () => ({
        mockToast: { success: vi.fn(), error: vi.fn() },
        mockSummaryAction: vi.fn(),
        mockGetCustomerByIdAction: vi.fn(),
        mockGetVehicles: vi.fn(),
    }),
);

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/actions/sales/customer', () => ({
    getCustomersWithCreditSummaryAction: (...args: unknown[]) => mockSummaryAction(...args),
    getCustomerById: (...args: unknown[]) => mockGetCustomerByIdAction(...args),
    deleteCustomer: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/actions/sales/vehicles', () => ({
    getVehicles: (...args: unknown[]) => mockGetVehicles(...args),
}));

// Simplify heavy child components is NOT needed — CustomerDialog already tested separately,
// but for page test we need it rendered to check initialData flow.
// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

import CustomersPage from '../page';

const leanCustomer = {
    id: 'cust-1',
    code: 'CUS-ADEHIDAYAT',
    name: 'Ade Hidayat',
    phone: '0812',
    city: 'PEKALONGAN',
    paymentTermDays: 0,
    creditLimit: 0,
    headroom: 1000000,
    exposureStatus: 'ok' as const,
    isActive: true,
};

const fullCustomer = {
    id: 'cust-1',
    code: 'CUS-ADEHIDAYAT',
    name: 'Ade Hidayat',
    phone: '0812',
    email: 'ade@example.com',
    billingAddress: 'Jl. Asli Lengkap',
    shippingAddress: 'Jl. Kirim Lengkap',
    taxId: '123',
    creditLimit: { toNumber: () => 0 },
    paymentTermDays: 0,
    discountPercent: null,
    maxDiscountPercent: null,
    notes: 'note lengkap',
    latitude: null,
    longitude: null,
    photoUrl: null,
    province: 'Jawa Tengah',
    city: 'PEKALONGAN',
    district: 'Kecamatan Asli',
    village: 'Kelurahan Asli',
    defaultVehicleId: null,
    isActive: true,
    lifecycleStatus: 'ACTIVE',
    createdById: null,
    verifiedAt: null,
    verifiedById: null,
    mergedIntoId: null,
    source: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-08-01'),
};

beforeEach(() => {
    vi.clearAllMocks();
    mockGetVehicles.mockResolvedValue({ success: true, data: [] });
    mockSummaryAction.mockResolvedValue({
        success: true,
        data: [leanCustomer],
    });
    mockGetCustomerByIdAction.mockResolvedValue({
        success: true,
        data: fullCustomer,
    });
});

describe('customers/page.tsx lazy-fetch edit (GAP6b)', () => {
    it('calls getCustomerById when edit button clicked before opening dialog', async () => {
        render(<CustomersPage />);

        await screen.findAllByText('Ade Hidayat');

        const editBtn = screen.getByTitle('Edit customer');
        fireEvent.click(editBtn);

        await waitFor(() => {
            expect(mockGetCustomerByIdAction).toHaveBeenCalledWith('cust-1');
        });
    });

    it('opens edit dialog with full fetched data (not lean)', async () => {
        render(<CustomersPage />);

        await screen.findAllByText('Ade Hidayat');

        fireEvent.click(screen.getByTitle('Edit customer'));

        await screen.findByText('Edit Customer');

        await waitFor(() => {
            expect(screen.getByDisplayValue('ade@example.com')).toBeDefined();
            expect(screen.getByDisplayValue('Jl. Asli Lengkap')).toBeDefined();
            expect(screen.getByDisplayValue('Jawa Tengah')).toBeDefined();
            expect(screen.getByDisplayValue('Kecamatan Asli')).toBeDefined();
            expect(screen.getByDisplayValue('Kelurahan Asli')).toBeDefined();
        });
    });

    it('does NOT render stray duplicate pencil button when editing (GAP1 check)', async () => {
        render(<CustomersPage />);

        await screen.findAllByText('Ade Hidayat');

        expect(screen.getAllByTitle('Edit customer').length).toBe(1);

        fireEvent.click(screen.getByTitle('Edit customer'));

        await screen.findByText('Edit Customer');

        const editButtons = screen.getAllByTitle('Edit customer');
        expect(editButtons.length).toBe(1);
    });

    it('shows Loader2 while fetching full data', async () => {
        let resolveFetch: (v: unknown) => void = () => {};
        mockGetCustomerByIdAction.mockReturnValue(
            new Promise((res) => {
                resolveFetch = res;
            }),
        );

        render(<CustomersPage />);

        await screen.findAllByText('Ade Hidayat');

        fireEvent.click(screen.getByTitle('Edit customer'));

        await waitFor(() => {
            const btn = screen.getByTitle('Edit customer') as HTMLButtonElement;
            expect(btn.disabled).toBe(true);
        });

        resolveFetch({ success: true, data: fullCustomer });

        await screen.findByText('Edit Customer');
    });

    it('renders Pencil icon (not unicode span) for edit button', async () => {
        render(<CustomersPage />);

        await screen.findAllByText('Ade Hidayat');

        expect(screen.queryByText('✎')).toBeNull();

        const editBtn = screen.getByTitle('Edit customer');
        const svg = editBtn.querySelector('svg');
        expect(svg).toBeTruthy();
    });
});
