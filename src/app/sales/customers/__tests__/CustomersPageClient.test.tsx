// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockDeleteCustomer,
    mockGetCustomerById,
    mockPathname,
    mockReplace,
    mockRefresh,
    mockToggleCustomer,
} = vi.hoisted(() => ({
    mockDeleteCustomer: vi.fn(),
    mockGetCustomerById: vi.fn(),
    mockPathname: vi.fn(() => '/sales/customers'),
    mockReplace: vi.fn(),
    mockRefresh: vi.fn(),
    mockToggleCustomer: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    usePathname: mockPathname,
    useRouter: () => ({ replace: mockReplace, refresh: mockRefresh }),
}));

vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

vi.mock('@/actions/sales/customer', () => ({
    deleteCustomer: mockDeleteCustomer,
    getCustomerById: mockGetCustomerById,
}));

vi.mock('@/components/customers/CustomerActiveToggle', () => ({
    CustomerActiveToggle: ({
        id,
        isActive,
        onToggled,
    }: {
        id: string;
        isActive: boolean;
        onToggled?: (id: string, isActive: boolean) => void;
    }) => (
        <button
            type="button"
            aria-label={isActive ? 'Nonaktifkan customer' : 'Aktifkan customer'}
            onClick={() => {
                mockToggleCustomer(id, !isActive);
                onToggled?.(id, !isActive);
            }}
        />
    ),
}));

vi.mock('@/components/customers/CustomerDialog', () => ({
    CustomerDialog: ({
        mode,
        open,
        initialData,
    }: {
        mode: 'create' | 'edit';
        open?: boolean;
        initialData?: { email?: string | null };
    }) =>
        mode === 'create' ? (
            <button type="button">Tambah Customer</button>
        ) : open ? (
            <div>Edit Customer {initialData?.email}</div>
        ) : null,
}));

vi.mock('@/components/common/DeleteButton', () => ({
    DeleteButton: ({
        id,
        open,
        onDelete,
        onDeleted,
    }: {
        id: string;
        open?: boolean;
        onDelete: (id: string) => Promise<{ success: boolean }>;
        onDeleted?: (id: string) => void;
    }) =>
        open ? (
            <button
                type="button"
                onClick={async () => {
                    const result = await onDelete(id);
                    if (result.success) onDeleted?.(id);
                }}
            >
                Konfirmasi hapus
            </button>
        ) : null,
}));

import CustomersPageClient from '../CustomersPageClient';

const customer = {
    id: 'cust-1',
    code: 'CUS-001',
    name: 'Ade Hidayat',
    phone: '0812',
    city: 'Pekalongan',
    paymentTermDays: 30,
    creditLimit: 5_000_000,
    headroom: 2_000_000,
    exposureStatus: 'safe' as const,
    isActive: true,
};

const pageData = {
    customers: [customer],
    total: 75,
    page: 2,
    pageSize: 50,
    totalPages: 2,
    search: 'ade',
    filter: 'active' as const,
};

const fullCustomer = {
    id: 'cust-1',
    code: 'CUS-001',
    name: 'Ade Hidayat',
    phone: '0812',
    email: 'ade@example.com',
    billingAddress: null,
    shippingAddress: null,
    taxId: null,
    creditLimit: null,
    paymentTermDays: 30,
    discountPercent: null,
    maxDiscountPercent: null,
    notes: null,
    latitude: null,
    longitude: null,
    photoUrl: null,
    province: null,
    city: 'Pekalongan',
    district: null,
    village: null,
    defaultVehicleId: null,
    isActive: true,
    lifecycleStatus: 'ACTIVE',
    createdById: null,
    verifiedAt: null,
    verifiedById: null,
    mergedIntoId: null,
    source: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-09-01'),
};

function renderPage() {
    return render(<CustomersPageClient pageData={pageData} />);
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteCustomer.mockResolvedValue({ success: true });
    mockGetCustomerById.mockResolvedValue({ success: true, data: fullCustomer });
});

describe('CustomersPageClient', () => {
    it('renders an accessible paged table with a sticky header and result context', () => {
        renderPage();

        expect(screen.getByRole('table', { name: 'Daftar customer' })).toBeTruthy();
        expect(screen.getByText('Menampilkan 51–75 dari 75 customer')).toBeTruthy();
        expect(
            screen.getByRole('combobox', { name: 'Jumlah customer per halaman' }),
        ).toBeTruthy();
        expect(screen.getByRole('navigation', { name: 'Paginasi tabel' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Halaman sebelumnya' })).toBeTruthy();
        expect(
            screen
                .getByRole('columnheader', { name: 'Kode' })
                .closest('thead')?.className,
        ).toContain('sticky');
    });

    it('backs search, clear-search, filters, and page size with the URL', () => {
        renderPage();

        const search = screen.getByRole('searchbox', { name: 'Cari customer' });
        expect(search.getAttribute('name')).toBe('q');

        fireEvent.click(
            screen.getByRole('button', { name: 'Hapus pencarian customer' }),
        );
        expect(mockReplace).toHaveBeenLastCalledWith(
            expect.not.stringContaining('q='),
        );
        expect(mockReplace).toHaveBeenLastCalledWith(
            expect.not.stringContaining('page=2'),
        );

        fireEvent.change(search, { target: { value: 'baru' } });
        fireEvent.submit(screen.getByRole('search'));
        expect(mockReplace).toHaveBeenLastCalledWith(
            expect.stringContaining('q=baru'),
        );

        fireEvent.change(
            screen.getByRole('combobox', {
                name: 'Jumlah customer per halaman',
            }),
            { target: { value: '100' } },
        );
        expect(mockReplace).toHaveBeenLastCalledWith(
            expect.stringContaining('pageSize=100'),
        );

        fireEvent.click(screen.getByRole('button', { name: 'Nonaktif' }));
        expect(mockReplace).toHaveBeenLastCalledWith(
            expect.stringContaining('filter=inactive'),
        );
    });

    it('keeps lazy edit, active toggle, and delete behavior', async () => {
        renderPage();

        fireEvent.click(screen.getByRole('button', { name: 'Nonaktifkan customer' }));
        expect(mockToggleCustomer).toHaveBeenCalledWith('cust-1', false);
        expect(mockRefresh).toHaveBeenCalled();

        const editMenuTrigger = screen.getByRole('button', {
            name: 'Aksi Ade Hidayat',
        });
        fireEvent.pointerDown(editMenuTrigger, { button: 0 });
        fireEvent.click(editMenuTrigger);
        fireEvent.click(await screen.findByText('Edit'));
        await waitFor(() => {
            expect(mockGetCustomerById).toHaveBeenCalledWith('cust-1');
        });
        expect(await screen.findByText(/ade@example.com/)).toBeTruthy();

        expect(
            screen.getByRole('link', { name: 'Ade Hidayat' }).getAttribute('href'),
        ).toBe('/sales/customers/cust-1');

        const deleteMenuTrigger = screen.getByRole('button', {
            name: 'Aksi Ade Hidayat',
        });
        fireEvent.pointerDown(deleteMenuTrigger, { button: 0 });
        fireEvent.click(deleteMenuTrigger);
        fireEvent.click(await screen.findByText('Hapus'));
        fireEvent.click(await screen.findByText('Konfirmasi hapus'));
        await waitFor(() => {
            expect(mockDeleteCustomer).toHaveBeenCalledWith('cust-1');
        });
    });
});
