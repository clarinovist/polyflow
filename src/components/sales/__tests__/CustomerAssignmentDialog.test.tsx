// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CustomerAssignmentDialog } from '../CustomerAssignmentDialog';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);
Element.prototype.scrollIntoView = vi.fn();

const mocks = vi.hoisted(() => ({
    getAssignments: vi.fn(),
    getCustomers: vi.fn(),
    assign: vi.fn(),
    unassign: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/sales/sales-team', () => ({
    getSalesTeamAssignedCustomersAction: mocks.getAssignments,
}));

vi.mock('@/actions/sales/customer-assignment', () => ({
    assignCustomerAction: mocks.assign,
    unassignCustomerAction: mocks.unassign,
}));

vi.mock('@/actions/sales/customer', () => ({
    getCustomers: mocks.getCustomers,
}));

vi.mock('sonner', () => ({ toast: mocks.toast }));

describe('CustomerAssignmentDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAssignments.mockResolvedValue({ success: true, data: [] });
        mocks.getCustomers.mockResolvedValue({ success: true, data: [] });
        mocks.assign.mockResolvedValue({ success: true, data: {} });
        mocks.unassign.mockResolvedValue({ success: true, data: {} });
    });

    it('renders dialog with user name in header', () => {
        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u1"
                userName="Budi"
            />,
        );
        expect(screen.getByText('Customer - Budi')).toBeDefined();
    });

    it('renders dialog description', () => {
        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u1"
                userName="Budi"
            />,
        );
        expect(
            screen.getByText('Kelola assignment customer untuk sales ini.'),
        ).toBeDefined();
    });

    it('renders with different user name', () => {
        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u2"
                userName="Sari"
            />,
        );
        expect(screen.getByText('Customer - Sari')).toBeDefined();
    });

    it('assigns an available customer and refreshes the roster', async () => {
        mocks.getCustomers.mockResolvedValue({
            success: true,
            data: [{ id: 'c2', name: 'Toko Dua', code: 'CUS-002' }],
        });
        const onAssignmentChange = vi.fn();

        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u1"
                userName="Budi"
                onAssignmentChange={onAssignmentChange}
            />,
        );

        const trigger = await screen.findByRole('combobox');
        fireEvent.click(trigger);
        fireEvent.click(await screen.findByText('Toko Dua (CUS-002)'));
        fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

        await waitFor(() => {
            expect(mocks.assign).toHaveBeenCalledWith({
                customerId: 'c2',
                userId: 'u1',
                isPrimary: true,
            });
            expect(mocks.toast.success).toHaveBeenCalledWith(
                'Customer berhasil di-assign',
            );
            expect(onAssignmentChange).toHaveBeenCalled();
        });
    });

    it('shows an assignment error without refreshing the roster', async () => {
        mocks.getCustomers.mockResolvedValue({
            success: true,
            data: [{ id: 'c2', name: 'Toko Dua', code: null }],
        });
        mocks.assign.mockResolvedValue({
            success: false,
            error: 'Customer tidak dapat di-assign',
            code: 'BUSINESS_RULE_VIOLATION',
        });
        const onAssignmentChange = vi.fn();

        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u1"
                userName="Budi"
                onAssignmentChange={onAssignmentChange}
            />,
        );

        fireEvent.click(await screen.findByRole('combobox'));
        fireEvent.click(await screen.findByText('Toko Dua'));
        fireEvent.click(screen.getByRole('button', { name: /Assign/i }));

        await waitFor(() => {
            expect(mocks.toast.error).toHaveBeenCalledWith(
                'Customer tidak dapat di-assign',
            );
        });
        expect(onAssignmentChange).not.toHaveBeenCalled();
    });

    it('unassigns an assigned customer and refreshes the roster', async () => {
        mocks.getAssignments.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'a1',
                    customerId: 'c1',
                    userId: 'u1',
                    isPrimary: true,
                    assignedAt: '2026-09-10T00:00:00.000Z',
                    customer: { id: 'c1', name: 'Toko Satu', code: 'CUS-001' },
                },
            ],
        });
        const onAssignmentChange = vi.fn();

        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u1"
                userName="Budi"
                onAssignmentChange={onAssignmentChange}
            />,
        );

        await waitFor(() => expect(screen.getAllByText('Toko Satu').length).toBeGreaterThan(0));
        const deleteButtons = screen.getAllByRole('button').filter((button) =>
            button.querySelector('.lucide-trash-2'),
        );
        fireEvent.click(deleteButtons[0]);

        await waitFor(() => {
            expect(mocks.unassign).toHaveBeenCalledWith({
                customerId: 'c1',
                userId: 'u1',
            });
            expect(mocks.toast.success).toHaveBeenCalledWith(
                'Customer berhasil di-unassign',
            );
            expect(onAssignmentChange).toHaveBeenCalled();
        });
    });

    it('shows the server error and does not report success', async () => {
        mocks.getAssignments.mockResolvedValue({
            success: true,
            data: [
                {
                    id: 'a1',
                    customerId: 'c1',
                    userId: 'u1',
                    isPrimary: true,
                    assignedAt: '2026-09-10T00:00:00.000Z',
                    customer: { id: 'c1', name: 'Toko Satu', code: null },
                },
            ],
        });
        mocks.unassign.mockResolvedValue({
            success: false,
            error: 'Tidak memiliki izin',
            code: 'AUTHORIZATION_ERROR',
        });

        render(
            <CustomerAssignmentDialog
                open={true}
                onOpenChange={vi.fn()}
                userId="u1"
                userName="Budi"
            />,
        );

        await waitFor(() => expect(screen.getAllByText('Toko Satu').length).toBeGreaterThan(0));
        const deleteButtons = screen.getAllByRole('button').filter((button) =>
            button.querySelector('.lucide-trash-2'),
        );
        fireEvent.click(deleteButtons[0]);

        await waitFor(() => {
            expect(mocks.toast.error).toHaveBeenCalledWith(
                'Tidak memiliki izin',
            );
        });
        expect(mocks.toast.success).not.toHaveBeenCalled();
    });
});
