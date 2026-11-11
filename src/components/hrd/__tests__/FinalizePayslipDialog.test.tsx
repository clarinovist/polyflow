// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { toast } from 'sonner';
import { FinalizePayslipDialog } from '../FinalizePayslipDialog';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const TARGET = {
    id: 'p-1',
    employeeName: 'Budi Contoh',
    loanDeduction: 150000,
    netPay: 4250000,
};

function setup(
    props: Partial<React.ComponentProps<typeof FinalizePayslipDialog>> = {},
) {
    const onConfirm = props.onConfirm ?? vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    render(
        <FinalizePayslipDialog
            target={TARGET}
            periodLabel="Januari 2026"
            onConfirm={onConfirm}
            onCancel={onCancel}
            {...props}
        />,
    );
    return { onConfirm, onCancel };
}

const confirmBtn = () => screen.getByRole('button', { name: /Konfirmasi|Memproses/ });

describe('FinalizePayslipDialog', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows employee, period, loan deduction and net pay', () => {
        setup();

        expect(screen.getByText(/Budi Contoh/)).toBeTruthy();
        expect(screen.getByText(/Januari 2026/)).toBeTruthy();
        expect(screen.getByText(/150\.000/)).toBeTruthy();
        expect(screen.getByText(/4\.250\.000/)).toBeTruthy();
    });

    it('calls onConfirm exactly once on confirm', async () => {
        const { onConfirm } = setup();

        fireEvent.click(confirmBtn());

        await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    });

    it('ignores a double click while the request is pending', async () => {
        let release: () => void = () => {};
        const onConfirm = vi.fn(
            () => new Promise<void>((resolve) => (release = resolve)),
        );
        setup({ onConfirm });

        fireEvent.click(confirmBtn());
        fireEvent.click(confirmBtn());

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(confirmBtn().hasAttribute('disabled')).toBe(true);
        expect(screen.getByRole('button', { name: 'Batal' }).hasAttribute('disabled')).toBe(true);
        release();
        await waitFor(() => expect(confirmBtn().hasAttribute('disabled')).toBe(false));
    });

    it('does not call onConfirm when cancelled', () => {
        const { onConfirm, onCancel } = setup();

        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('shows the server error message and re-enables the button', async () => {
        const onConfirm = vi.fn().mockRejectedValue(new Error('Potongan kasbon melebihi sisa kasbon aktif'));
        setup({ onConfirm });

        fireEvent.click(confirmBtn());

        await waitFor(() =>
            expect(screen.getByRole('alert').textContent).toMatch(/melebihi sisa kasbon/),
        );
        expect(toast.error).toHaveBeenCalledWith(
            'Potongan kasbon melebihi sisa kasbon aktif',
        );
        expect(confirmBtn().hasAttribute('disabled')).toBe(false);
    });
});
