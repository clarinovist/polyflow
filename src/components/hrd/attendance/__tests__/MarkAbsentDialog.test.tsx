// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { toast } from 'sonner';
import { setAbsent } from '@/actions/admin/attendance';
import { MarkAbsentDialog } from '../MarkAbsentDialog';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/admin/attendance', () => ({ setAbsent: vi.fn() }));

const SHIFTS = [
    { id: 's-1', name: 'Shift Pagi', status: 'ACTIVE' },
    { id: 's-2', name: 'Shift Malam', status: 'ACTIVE' },
    { id: 's-off', name: 'Shift Mati', status: 'INACTIVE' },
];
const WITH_SHIFT = {
    employeeId: 'e-1',
    name: 'Budi Contoh',
    code: 'E001',
    assignedShift: { id: 's-1', name: 'Shift Pagi' },
};
const WITHOUT_SHIFT = { ...WITH_SHIFT, assignedShift: null };

function setup(
    target: typeof WITH_SHIFT | typeof WITHOUT_SHIFT | null = WITH_SHIFT,
) {
    const onClose = vi.fn();
    const onMarked = vi.fn();
    render(
        <MarkAbsentDialog
            target={target}
            workDate="2026-11-10"
            shifts={SHIFTS}
            onClose={onClose}
            onMarked={onMarked}
        />,
    );
    return { onClose, onMarked };
}

const confirmBtn = () =>
    screen.getByRole('button', { name: /Ya, tandai tidak hadir|Menyimpan/ });

describe('MarkAbsentDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(setAbsent).mockResolvedValue({ success: true } as never);
    });

    it('renders nothing when there is no target', () => {
        setup(null);

        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('names the employee and the date being marked', () => {
        setup();

        expect(screen.getByText(/Budi Contoh/)).toBeTruthy();
        expect(screen.getByText(/E001/)).toBeTruthy();
        expect(screen.getByText(/10 November 2026/)).toBeTruthy();
    });

    it('preselects the assigned shift and offers only active shifts', () => {
        setup();

        const select = screen.getByLabelText('Shift') as HTMLSelectElement;

        expect(select.value).toBe('s-1');
        const labels = Array.from(select.options).map((o) => o.textContent);
        expect(labels).toContain('Shift Malam');
        expect(labels).not.toContain('Shift Mati');
    });

    it('calls setAbsent once with employee, date and shift on confirm', async () => {
        const { onMarked, onClose } = setup();

        fireEvent.click(confirmBtn());

        await waitFor(() => expect(onMarked).toHaveBeenCalledTimes(1));
        expect(setAbsent).toHaveBeenCalledTimes(1);
        expect(setAbsent).toHaveBeenCalledWith('e-1', '2026-11-10', 's-1');
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(toast.success).toHaveBeenCalled();
    });

    it('sends the shift chosen by the user instead of the default', async () => {
        const { onMarked } = setup();

        fireEvent.change(screen.getByLabelText('Shift'), {
            target: { value: 's-2' },
        });
        fireEvent.click(confirmBtn());

        await waitFor(() => expect(onMarked).toHaveBeenCalled());
        expect(setAbsent).toHaveBeenCalledWith('e-1', '2026-11-10', 's-2');
    });

    it('ignores a double click while the request is pending', async () => {
        let release: (value: unknown) => void = () => {};
        vi.mocked(setAbsent).mockImplementation(
            () => new Promise((resolve) => (release = resolve)) as never,
        );
        const { onMarked } = setup();

        fireEvent.click(confirmBtn());
        fireEvent.click(confirmBtn());

        expect(setAbsent).toHaveBeenCalledTimes(1);
        expect(confirmBtn().hasAttribute('disabled')).toBe(true);
        release({ success: true });
        await waitFor(() => expect(onMarked).toHaveBeenCalledTimes(1));
    });

    it('does not call setAbsent when cancelled', () => {
        const { onClose, onMarked } = setup();

        fireEvent.click(screen.getByRole('button', { name: 'Batal' }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onMarked).not.toHaveBeenCalled();
        expect(setAbsent).not.toHaveBeenCalled();
    });

    it('requires choosing a shift when the employee has no assignment', async () => {
        const { onMarked } = setup(WITHOUT_SHIFT);

        expect((screen.getByLabelText('Shift') as HTMLSelectElement).value).toBe('');
        expect(confirmBtn().hasAttribute('disabled')).toBe(true);
        expect(screen.getByText(/belum punya shift/i)).toBeTruthy();

        fireEvent.click(confirmBtn());
        expect(setAbsent).not.toHaveBeenCalled();

        fireEvent.change(screen.getByLabelText('Shift'), {
            target: { value: 's-2' },
        });
        expect(confirmBtn().hasAttribute('disabled')).toBe(false);
        fireEvent.click(confirmBtn());

        await waitFor(() => expect(onMarked).toHaveBeenCalled());
        expect(setAbsent).toHaveBeenCalledWith('e-1', '2026-11-10', 's-2');
    });

    it('shows the service error, keeps the dialog open and allows retry', async () => {
        vi.mocked(setAbsent).mockResolvedValueOnce({
            success: false,
            error: 'Record sudah ada untuk shift ini',
        } as never);
        const { onMarked, onClose } = setup();

        fireEvent.click(confirmBtn());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toContain('Record sudah ada untuk shift ini');
        expect(onMarked).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(confirmBtn().hasAttribute('disabled')).toBe(false);
    });

    it('shows a generic error when the request throws', async () => {
        vi.mocked(setAbsent).mockRejectedValueOnce(new Error('network'));
        const { onMarked } = setup();

        fireEvent.click(confirmBtn());

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toMatch(/Gagal menandai/);
        expect(onMarked).not.toHaveBeenCalled();
    });

    it('warns when no active shift exists at all', () => {
        const onClose = vi.fn();
        render(
            <MarkAbsentDialog
                target={WITHOUT_SHIFT}
                workDate="2026-11-10"
                shifts={[]}
                onClose={onClose}
                onMarked={vi.fn()}
            />,
        );

        expect(screen.getByText(/Belum ada shift aktif/)).toBeTruthy();
        expect(confirmBtn().hasAttribute('disabled')).toBe(true);
    });
});
