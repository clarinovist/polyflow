// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
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

vi.mock('@/actions/sales/sales-team', () => ({
    getSalesTeamAssignedCustomersAction: vi
        .fn()
        .mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/actions/sales/customer-assignment', () => ({
    assignCustomerAction: vi.fn().mockResolvedValue({ success: true }),
    unassignCustomerAction: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/actions/sales/customer', () => ({
    getCustomers: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe('CustomerAssignmentDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
});
