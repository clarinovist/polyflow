// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerActiveToggle } from '../CustomerActiveToggle';

vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    },
);

const { mockToast, mockToggleCustomerActive } = vi.hoisted(() => ({
    mockToast: { success: vi.fn(), error: vi.fn() },
    mockToggleCustomerActive: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/actions/sales/customer', () => ({
    toggleCustomerActive: (...args: unknown[]) =>
        mockToggleCustomerActive(...args),
}));

describe('CustomerActiveToggle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders as checked when isActive is true', () => {
        render(<CustomerActiveToggle id="cust-1" isActive={true} />);

        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
            'true',
        );
    });

    it('renders as unchecked when isActive is false', () => {
        render(<CustomerActiveToggle id="cust-1" isActive={false} />);

        expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
            'false',
        );
    });

    it('toggles to inactive, calls the action, shows success toast, and notifies onToggled', async () => {
        mockToggleCustomerActive.mockResolvedValue({
            success: true,
            data: null,
        });
        const onToggled = vi.fn();

        render(
            <CustomerActiveToggle
                id="cust-1"
                isActive={true}
                onToggled={onToggled}
            />,
        );

        fireEvent.click(screen.getByRole('switch'));

        await waitFor(() => {
            expect(mockToggleCustomerActive).toHaveBeenCalledWith({
                id: 'cust-1',
                isActive: false,
            });
        });
        await waitFor(() => {
            expect(mockToast.success).toHaveBeenCalledWith(
                'Customer dinonaktifkan',
            );
        });
        expect(onToggled).toHaveBeenCalledWith('cust-1', false);
        expect(
            screen.getByRole('switch').getAttribute('aria-checked'),
        ).toBe('false');
    });

    it('toggles to active and shows the activated success toast', async () => {
        mockToggleCustomerActive.mockResolvedValue({
            success: true,
            data: null,
        });

        render(<CustomerActiveToggle id="cust-2" isActive={false} />);

        fireEvent.click(screen.getByRole('switch'));

        await waitFor(() => {
            expect(mockToast.success).toHaveBeenCalledWith(
                'Customer diaktifkan',
            );
        });
    });

    it('reverts the switch and shows an error toast when the action returns failure', async () => {
        mockToggleCustomerActive.mockResolvedValue({
            success: false,
            error: 'Gagal mengubah status customer.',
        });

        render(<CustomerActiveToggle id="cust-1" isActive={true} />);

        fireEvent.click(screen.getByRole('switch'));

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith(
                'Gagal mengubah status customer.',
            );
        });
        expect(
            screen.getByRole('switch').getAttribute('aria-checked'),
        ).toBe('true');
    });

    it('reverts the switch and shows a generic error toast when the action throws', async () => {
        mockToggleCustomerActive.mockRejectedValue(new Error('network down'));

        render(<CustomerActiveToggle id="cust-1" isActive={true} />);

        fireEvent.click(screen.getByRole('switch'));

        await waitFor(() => {
            expect(mockToast.error).toHaveBeenCalledWith(
                'Gagal mengubah status customer.',
            );
        });
        expect(
            screen.getByRole('switch').getAttribute('aria-checked'),
        ).toBe('true');
    });
});
