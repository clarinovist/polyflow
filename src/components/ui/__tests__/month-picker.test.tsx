// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MonthPicker } from '../month-picker';

describe('MonthPicker mobile controls', () => {
    it('names month navigation and keeps operational targets touch-sized', () => {
        const onDateChange = vi.fn();
        render(
            <MonthPicker
                currentDate={new Date(2026, 7, 15)}
                onDateChange={onDateChange}
            />,
        );

        const previous = screen.getByRole('button', {
            name: 'Bulan sebelumnya',
        });
        const next = screen.getByRole('button', { name: 'Bulan berikutnya' });
        const current = screen.getByRole('button', { name: 'Bulan Ini' });
        expect(previous.className).toContain('h-11');
        expect(next.className).toContain('h-11');
        expect(current.className).toContain('min-h-11');

        fireEvent.click(previous);
        expect(onDateChange).toHaveBeenCalledWith({
            from: expect.any(Date),
            to: expect.any(Date),
        });
    });
});
