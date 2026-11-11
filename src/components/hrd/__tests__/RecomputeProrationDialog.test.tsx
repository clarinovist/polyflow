// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { toast } from 'sonner';
import { RecomputeProrationDialog } from '../RecomputeProrationDialog';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const TARGET = {
    id: 'p-1',
    employeeName: 'Budi Contoh',
    prorationDeduction: 175000,
};

function setup(
    props: Partial<React.ComponentProps<typeof RecomputeProrationDialog>> = {},
) {
    const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
        <RecomputeProrationDialog
            target={TARGET}
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...props}
        />,
    );
    return { onConfirm, onCancel };
}

const confirmBtn = () =>
    screen.getByRole('button', { name: /Hitung ulang|Memproses/ });

describe('RecomputeProrationDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows the employee and the current deduction', () => {
        setup();

        expect(screen.getByText(/Budi Contoh/)).toBeTruthy();
        expect(screen.getByText(/175\.000/)).toBeTruthy();
    });

    it('warns that manually entered values will be overwritten', () => {
        setup();

        expect(screen.getByText(/nilai yang diisi manual akan ditimpa/i)).toBeTruthy();
    });

    it('calls onConfirm exactly once with the payslip id', async () => {
        const { onConfirm } = setup();

        fireEvent.click(confirmBtn());

        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
        expect(onConfirm).toHaveBeenCalledWith('p-1');
    });

    it('ignores a double click while the request is pending and disables buttons', async () => {
        let release: () => void = () => {};
        const onConfirm = vi.fn(
            () => new Promise<void>((resolve) => (release = resolve)),
        );
        setup({ onConfirm });

        fireEvent.click(confirmBtn());
        fireEvent.click(confirmBtn());

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(confirmBtn().hasAttribute('disabled')).toBe(true);
        expect(
            screen.getByRole('button', { name: 'Batal' }).hasAttribute('disabled'),
        ).toBe(true);
        release();
        await waitFor(() =>
            expect(confirmBtn().hasAttribute('disabled')).toBe(false),
        );
    });

    it('does not call onConfirm when cancelled', () => {
        const { onConfirm, onCancel } = setup();

        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows the error message and re-enables the button on failure', async () => {
        const onConfirm = vi
            .fn()
            .mockRejectedValue(new Error('Hanya slip DRAFT yang bisa dihitung ulang'));
        setup({ onConfirm });

        fireEvent.click(confirmBtn());

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/slip DRAFT/),
        );
        expect(toast.error).toHaveBeenCalledWith(
            'Hanya slip DRAFT yang bisa dihitung ulang',
        );
        expect(confirmBtn().hasAttribute('disabled')).toBe(false);
    });

    it('renders nothing when there is no target', () => {
        setup({ target: null });

        expect(screen.queryByRole('dialog')).toBeNull();
    });
});
