// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FinalizeOpnameDialog } from '../FinalizeOpnameDialog';

afterEach(() => vi.useRealTimers());

describe('FinalizeOpnameDialog', () => {
    it('defaults to today, warns about uncounted items, and submits the selected date', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
        const onConfirm = vi.fn();

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={vi.fn()}
                onConfirm={onConfirm}
                isSubmitting={false}
                uncountedItems={2}
            />,
        );

        const input = screen.getByLabelText('Tanggal Efektif') as HTMLInputElement;
        expect(input.value).toBe('2026-10-02');
        expect(input.max).toBe('2026-10-02');
        expect(screen.getByRole('alert').textContent).toContain(
            '2 item belum dihitung',
        );

        fireEvent.change(input, { target: { value: '2026-09-30' } });
        fireEvent.click(screen.getByRole('button', { name: 'Finalisasi' }));

        expect(onConfirm).toHaveBeenCalledExactlyOnceWith('2026-09-30');
    });

    it('does not allow dismissal or duplicate submission while pending', () => {
        const onOpenChange = vi.fn();
        const onConfirm = vi.fn();

        render(
            <FinalizeOpnameDialog
                open
                onOpenChange={onOpenChange}
                onConfirm={onConfirm}
                isSubmitting
            />,
        );

        expect(
            (screen.getByRole('button', { name: 'Finalisasi' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);
        expect(
            (screen.getByRole('button', { name: 'Batal' }) as HTMLButtonElement)
                .disabled,
        ).toBe(true);

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(onOpenChange).not.toHaveBeenCalledWith(false);
        expect(onConfirm).not.toHaveBeenCalled();
    });
});
