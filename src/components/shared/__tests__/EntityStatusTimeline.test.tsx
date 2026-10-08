// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityStatusTimeline } from '../EntityStatusTimeline';

const timeline = vi.hoisted(() => vi.fn());

vi.mock('@/actions/audit/entity-timeline', () => ({
    getEntityStatusTimeline: timeline,
}));

afterEach(cleanup);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('EntityStatusTimeline', () => {
    it('shows an honest empty state after a successful empty response', async () => {
        timeline.mockResolvedValue({ success: true, data: [] });
        render(<EntityStatusTimeline entityType="DeliveryOrder" entityId="do-1" />);
        await waitFor(() =>
            expect(
                screen.getByText('Belum ada perubahan status tercatat.'),
            ).toBeDefined(),
        );
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it.each([
        { name: 'action failure', result: { success: false, error: 'denied' } },
        { name: 'request rejection', result: new Error('offline') },
    ])('shows an error instead of an empty audit for $name', async ({ result }) => {
        if (result instanceof Error) timeline.mockRejectedValue(result);
        else timeline.mockResolvedValue(result);

        render(<EntityStatusTimeline entityType="DeliveryOrder" entityId="do-1" />);

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Riwayat status tidak dapat dimuat');
        expect(screen.getByRole('button', { name: 'Coba lagi' })).toBeDefined();
        expect(
            screen.queryByText('Belum ada perubahan status tercatat.'),
        ).toBeNull();
    });

    it('retries a failed request in place', async () => {
        timeline
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ success: true, data: [] });
        render(<EntityStatusTimeline entityType="DeliveryOrder" entityId="do-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
        await waitFor(() =>
            expect(
                screen.getByText('Belum ada perubahan status tercatat.'),
            ).toBeDefined(),
        );
        expect(timeline).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale response after the requested entity changes', async () => {
        let resolveFirst!: (value: { success: true; data: [] }) => void;
        timeline
            .mockReturnValueOnce(
                new Promise<{ success: true; data: [] }>((resolve) => {
                    resolveFirst = resolve;
                }),
            )
            .mockResolvedValueOnce({
                success: true,
                data: [
                    {
                        id: 'new-entry',
                        action: 'UPDATE_DELIVERY_STATUS',
                        fromStatus: 'LOADING',
                        toStatus: 'SHIPPED',
                        details: null,
                        createdAt: '2026-10-08T08:00:00.000Z',
                        userName: 'Operator Test',
                    },
                ],
            });

        const view = render(
            <EntityStatusTimeline entityType="DeliveryOrder" entityId="old" />,
        );
        view.rerender(
            <EntityStatusTimeline entityType="DeliveryOrder" entityId="new" />,
        );
        await waitFor(() => expect(screen.getByText('Loading')).toBeDefined());

        resolveFirst({ success: true, data: [] });
        await waitFor(() => expect(screen.getByText('Loading')).toBeDefined());
        expect(
            screen.queryByText('Belum ada perubahan status tercatat.'),
        ).toBeNull();
    });
});
