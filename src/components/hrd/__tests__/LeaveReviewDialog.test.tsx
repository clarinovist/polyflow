// @vitest-environment jsdom

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { LeaveReviewDialog } from '../LeaveReviewDialog';

const TARGET = {
    id: 'l-1',
    employeeName: 'Budi Contoh',
    startDate: '2026-01-05T12:00:00.000Z',
    endDate: '2026-01-07T12:00:00.000Z',
};

function setup(
    props: Partial<React.ComponentProps<typeof LeaveReviewDialog>> = {},
) {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
        <LeaveReviewDialog
            target={TARGET}
            mode="reject"
            isBusy={false}
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...props}
        />,
    );
    return { onConfirm, onCancel };
}

const confirmButton = (name: string) => screen.getByRole('button', { name });

describe('LeaveReviewDialog', () => {
    it('shows the employee name and date range', () => {
        setup();

        expect(screen.getByText(/Budi Contoh/)).toBeTruthy();
        expect(screen.getByText(/05 Jan/)).toBeTruthy();
        expect(screen.getByText(/07 Jan 2026/)).toBeTruthy();
    });

    it('requires a reason before rejecting', () => {
        const { onConfirm } = setup({ mode: 'reject' });
        const tolak = confirmButton('Tolak');

        expect(tolak.hasAttribute('disabled')).toBe(true);
        fireEvent.change(screen.getByLabelText(/Alasan/), {
            target: { value: '   ' },
        });
        expect(tolak.hasAttribute('disabled')).toBe(true);
        fireEvent.change(screen.getByLabelText(/Alasan/), {
            target: { value: 'Stok orang kurang' },
        });
        expect(tolak.hasAttribute('disabled')).toBe(false);
        fireEvent.click(tolak);

        expect(onConfirm).toHaveBeenCalledWith('Stok orang kurang');
    });

    it('allows approving without a note', () => {
        const { onConfirm } = setup({ mode: 'approve' });

        fireEvent.click(confirmButton('Setujui'));

        expect(onConfirm).toHaveBeenCalledWith('');
    });

    it('disables both buttons while busy so it cannot double-submit', () => {
        setup({ mode: 'approve', isBusy: true });

        expect(confirmButton('Memproses…').hasAttribute('disabled')).toBe(true);
        expect(confirmButton('Batal').hasAttribute('disabled')).toBe(true);
    });

    it('cancels without confirming', () => {
        const { onConfirm, onCancel } = setup({ mode: 'approve' });

        fireEvent.click(confirmButton('Batal'));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('renders nothing when there is no target', () => {
        setup({ target: null });

        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
