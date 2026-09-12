// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LeavePage from '../page';

vi.mock('@/components/hrd/LeaveRequestsManager', () => ({
    LeaveRequestsManager: (props: {
        initialStatus?: string;
        initialRequestId?: string;
    }) => (
        <div
            data-testid="leave-manager"
            data-status={props.initialStatus}
            data-request-id={props.initialRequestId}
        />
    ),
}));

describe('LeavePage', () => {
    it('passes supported queue and request focus parameters to the manager', async () => {
        render(
            await LeavePage({
                searchParams: Promise.resolve({
                    status: 'PENDING',
                    requestId: 'leave-1',
                }),
            }),
        );

        const manager = screen.getByTestId('leave-manager');
        expect(manager.getAttribute('data-status')).toBe('PENDING');
        expect(manager.getAttribute('data-request-id')).toBe('leave-1');
    });

    it('ignores unsupported status values instead of inventing a filter', async () => {
        render(
            await LeavePage({
                searchParams: Promise.resolve({
                    status: 'OVERDUE',
                    requestId: '  ',
                }),
            }),
        );

        const manager = screen.getByTestId('leave-manager');
        expect(manager.getAttribute('data-status')).toBeNull();
        expect(manager.getAttribute('data-request-id')).toBeNull();
    });
});
