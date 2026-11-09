// @vitest-environment jsdom
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { PackagingModeToggle } from '../PackagingModeToggle';
import { setProductionOrderPackagingMode } from '@/actions/production/production-orders';
import type { ExtendedProductionOrder } from '@/components/production/order-detail/types';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/actions/production/production-orders', () => ({
    setProductionOrderPackagingMode: vi.fn(),
}));

function makeOrder(overrides: Record<string, unknown> = {}) {
    return {
        id: 'po-1',
        status: 'RELEASED',
        actualPackagingEnabled: false,
        requestedOutputVariantId: null,
        executions: [],
        ...overrides,
    } as unknown as ExtendedProductionOrder;
}

const SWITCH_NAME = /Catat kemasan aktual/;

describe('PackagingModeToggle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(setProductionOrderPackagingMode).mockResolvedValue({
            success: true,
            data: null,
        } as never);
    });

    it('shows an editable switch when there are no executions and the order is open', () => {
        render(<PackagingModeToggle order={makeOrder()} />);

        const toggle = screen.getByRole('switch', { name: SWITCH_NAME });
        expect(toggle.getAttribute('aria-checked')).toBe('false');
        expect((toggle as HTMLButtonElement).disabled).toBe(false);
    });

    it('saves the new value, confirms with a toast and refreshes the page', async () => {
        render(<PackagingModeToggle order={makeOrder()} />);

        fireEvent.click(screen.getByRole('switch', { name: SWITCH_NAME }));

        await waitFor(() => expect(toast.success).toHaveBeenCalled());
        expect(setProductionOrderPackagingMode).toHaveBeenCalledWith({
            id: 'po-1',
            enabled: true,
        });
        expect(refresh).toHaveBeenCalled();
        expect(
            screen
                .getByRole('switch', { name: SWITCH_NAME })
                .getAttribute('aria-checked'),
        ).toBe('true');
    });

    it('shows the server error and keeps the previous value when saving fails', async () => {
        vi.mocked(setProductionOrderPackagingMode).mockResolvedValue({
            success: false,
            error: 'SPK sudah punya hasil',
        } as never);
        render(<PackagingModeToggle order={makeOrder()} />);

        fireEvent.click(screen.getByRole('switch', { name: SWITCH_NAME }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('SPK sudah punya hasil'),
        );
        expect(toast.success).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
        expect(
            screen
                .getByRole('switch', { name: SWITCH_NAME })
                .getAttribute('aria-checked'),
        ).toBe('false');
    });

    it('is hidden once an execution exists and the flag is off', () => {
        const { container } = render(
            <PackagingModeToggle
                order={makeOrder({ executions: [{ id: 'ex-1' }] })}
            />,
        );

        expect(container.innerHTML).toBe('');
    });

    it('shows a read-only badge once an execution exists and the flag is on', () => {
        render(
            <PackagingModeToggle
                order={makeOrder({
                    executions: [{ id: 'ex-1' }],
                    actualPackagingEnabled: true,
                })}
            />,
        );

        expect(screen.getByText('Kemasan aktual: Aktif')).toBeTruthy();
        expect(screen.queryByRole('switch')).toBeNull();
    });

    it.each(['CANCELLED', 'CLOSED', 'COMPLETED'])(
        'is read-only for terminal status %s',
        (status) => {
            render(
                <PackagingModeToggle
                    order={makeOrder({ status, actualPackagingEnabled: true })}
                />,
            );

            expect(screen.getByText('Kemasan aktual: Aktif')).toBeTruthy();
            expect(screen.queryByRole('switch')).toBeNull();
        },
    );

    it('treats a missing executions list as no executions', () => {
        render(
            <PackagingModeToggle order={makeOrder({ executions: undefined })} />,
        );

        expect(screen.getByRole('switch', { name: SWITCH_NAME })).toBeTruthy();
    });

    it('keeps the switch on and locked for an order mapped to a packaged product', () => {
        render(
            <PackagingModeToggle
                order={makeOrder({
                    actualPackagingEnabled: true,
                    requestedOutputVariantId: 'variant-1',
                })}
            />,
        );

        const toggle = screen.getByRole('switch', { name: SWITCH_NAME });
        expect((toggle as HTMLButtonElement).disabled).toBe(true);
        expect(toggle.getAttribute('aria-checked')).toBe('true');
    });
});
