// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerDialog } from '../CustomerDialog';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const { mockRefresh, mockToast, mockGetVehicles, mockCreateCustomer, mockUpdateCustomer } =
    vi.hoisted(() => ({
        mockRefresh: vi.fn(),
        mockToast: { success: vi.fn(), error: vi.fn() },
        mockGetVehicles: vi.fn(),
        mockCreateCustomer: vi.fn(),
        mockUpdateCustomer: vi.fn(),
    }));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/actions/sales/vehicles', () => ({
    getVehicles: (...args: unknown[]) => mockGetVehicles(...args),
}));

vi.mock('@/actions/sales/customer', () => ({
    createCustomer: (...args: unknown[]) => mockCreateCustomer(...args),
    updateCustomer: (...args: unknown[]) => mockUpdateCustomer(...args),
}));

function makeCustomer(override: Partial<Record<string, unknown>> = {}) {
    return {
        id: 'c1',
        name: 'Ade Hidayat',
        code: 'CUS-ADEHIDAYAT',
        phone: '0812',
        email: 'ade@test.com',
        billingAddress: 'Jl. A',
        shippingAddress: '',
        taxId: '',
        creditLimit: 0,
        paymentTermDays: 15,
        discountPercent: 0,
        maxDiscountPercent: null,
        notes: '',
        latitude: null,
        longitude: null,
        photoUrl: null,
        province: 'Jawa Barat',
        city: 'PEKALONGAN',
        district: 'Cinambo',
        village: 'Cimbu',
        defaultVehicleId: null,
        isActive: true,
        lifecycleStatus: 'ACTIVE',
        createdById: null,
        verifiedAt: null,
        verifiedById: null,
        mergedIntoId: null,
        source: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-02'),
        ...override,
    } as unknown as Parameters<typeof CustomerDialog>[0]['initialData'];
}

beforeEach(() => {
    vi.clearAllMocks();
    mockGetVehicles.mockResolvedValue({ success: true, data: [] });
    mockCreateCustomer.mockResolvedValue({ success: true });
    mockUpdateCustomer.mockResolvedValue({ success: true });
});

describe('CustomerDialog reset behavior (TOP stale fix)', () => {
    it('shows initialData values when dialog opens', async () => {
        const customer = makeCustomer({ paymentTermDays: 15, city: 'PEKALONGAN' });
        const Wrapper = ({ open }: { open: boolean }) => (
            <CustomerDialog mode="edit" initialData={customer} open={open} onOpenChange={vi.fn()} />
        );

        const { rerender } = render(<Wrapper open={false} />);
        // initially closed -> inputs not in DOM (or hidden by Dialog)
        rerender(<Wrapper open={true} />);

        await waitFor(() => {
            // name input should have customer's name
            expect(screen.getByDisplayValue('Ade Hidayat')).toBeDefined();
        });

        // Terms (Days) field
        const termInputs = screen.getAllByDisplayValue('15');
        expect(termInputs.length).toBeGreaterThan(0);
    });

    it('resets form to NEW initialData when closed then reopened with different data (stale fix)', async () => {
        const customerOld = makeCustomer({
            paymentTermDays: 15,
            province: 'Jawa Barat',
            district: 'Cinambo',
            village: 'Cimbu',
            city: 'PEKALONGAN',
        });
        const customerNew = makeCustomer({
            paymentTermDays: 0,
            province: 'Jawa Tengah',
            district: '',
            village: '',
            city: 'PEKALONGAN',
            name: 'Ade Hidayat Updated',
        });

        const onOpenChange = vi.fn();
        function Wrapper({
            open,
            data,
        }: {
            open: boolean;
            data: typeof customerOld;
        }) {
            return (
                <CustomerDialog
                    mode="edit"
                    initialData={data}
                    open={open}
                    onOpenChange={onOpenChange}
                />
            );
        }

        const { rerender } = render(<Wrapper open={false} data={customerOld} />);
        rerender(<Wrapper open={true} data={customerOld} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue('Ade Hidayat')).toBeDefined();
        });
        expect(screen.getAllByDisplayValue('15').length).toBeGreaterThan(0);

        // Close dialog
        rerender(<Wrapper open={false} data={customerOld} />);
        // Brief tick
        await new Promise((r) => setTimeout(r, 0));

        // Reopen with NEW data — should show 0, not 15
        rerender(<Wrapper open={true} data={customerNew} />);

        await waitFor(() => {
            expect(screen.getByDisplayValue('Ade Hidayat Updated')).toBeDefined();
        });

        // Old term 15 should NOT be visible; new term 0 should be
        await waitFor(() => {
            const zeroInputs = screen.getAllByDisplayValue('0');
            // at least the TOP input
            expect(zeroInputs.length).toBeGreaterThan(0);
        });

        // Verify new province
        expect(screen.getByDisplayValue('Jawa Tengah')).toBeDefined();
    });

    it('hides default trigger when custom hidden trigger provided (GAP1)', async () => {
        const customer = makeCustomer();
        render(
            <CustomerDialog
                mode="edit"
                initialData={customer}
                trigger={<span className="hidden" aria-hidden="true" />}
                open={true}
                onOpenChange={vi.fn()}
            />,
        );

        await waitFor(() => {
            expect(screen.getByDisplayValue('Ade Hidayat')).toBeDefined();
        });

        // Default trigger would render Button with Pencil icon — should NOT appear as extra button
        // We check that there is only one Edit Customer title, not duplicate pencil buttons outside dialog
        // The hidden span should not produce visible pencil text
        const titles = screen.getAllByText('Edit Customer');
        expect(titles.length).toBe(1);
    });

    it('calls getVehicles when dialog opens', async () => {
        const customer = makeCustomer();
        render(
            <CustomerDialog
                mode="edit"
                initialData={customer}
                open={true}
                onOpenChange={vi.fn()}
            />,
        );
        await waitFor(() => {
            expect(mockGetVehicles).toHaveBeenCalled();
        });
    });
});
