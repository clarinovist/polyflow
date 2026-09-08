// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { TransactionDateFilter } from '../transaction-date-filter';

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('transaction date filter upper-only bounds', () => {
    it('allows month navigation and resyncs to an externally changed range', () => {
        const view = render(<TransactionDateFilter date={{ from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) }} />);
        fireEvent.click(screen.getByRole('button', { name: /Agt 01, 2026/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Go to the Next Month' }));
        expect(screen.getByText('Oktober 2026')).toBeTruthy();
        view.rerender(<TransactionDateFilter date={{ from: new Date(2026, 6, 1), to: new Date(2026, 6, 31) }} />);
        expect(screen.getByText('Juli 2026')).toBeTruthy();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });
    it.each([
        ['Hari Ini', 1, 1], ['Bulan Ini', 1, 30], ['Minggu Ini', 31, 6],
    ])('uses WIB calendar dates for opt-in %s', (label, fromDay, toDay) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-08-31T18:00:00Z'));
        const onDateChange = vi.fn();
        render(<TransactionDateFilter presetTimeZone="Asia/Jakarta" date={{ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) }} onDateChange={onDateChange} />);
        fireEvent.click(screen.getByRole('button', { name: /Sep 01, 2026/ }));
        fireEvent.click(screen.getByRole('button', { name: String(label) }));
        const range = onDateChange.mock.calls[0][0];
        expect(range.from.getDate()).toBe(fromDay);
        expect(range.to.getDate()).toBe(toDay);
        if (label !== 'Minggu Ini') expect(range.from.getMonth()).toBe(8);
    });
    it('preserves an explicit upper cutoff instead of applying this-month default', () => {
        const onDateChange = vi.fn();
        render(<DatePickerWithRange date={{ from: undefined, to: new Date('2026-07-31T17:00:00Z') }} onDateChange={onDateChange} />);
        expect(onDateChange).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: /Sampai/ })).toBeTruthy();
        expect(screen.queryByText('Semua Waktu')).toBeNull();
    });

    it('still applies the requested default when neither bound is present', () => {
        const onDateChange = vi.fn();
        render(<DatePickerWithRange onDateChange={onDateChange} />);
        expect(onDateChange).toHaveBeenCalledTimes(1);
        expect(onDateChange).toHaveBeenCalledWith({ from: expect.any(Date), to: expect.any(Date) });
    });

    it('preserves a lower-only bound and explicit all-time without a default', () => {
        const onDateChange = vi.fn();
        const view = render(<TransactionDateFilter date={{ from: new Date('2026-08-01T00:00:00Z') }} defaultPreset="this_month" onDateChange={onDateChange} />);
        expect(onDateChange).not.toHaveBeenCalled();
        view.unmount();
        render(<TransactionDateFilter onDateChange={onDateChange} />);
        expect(screen.getByRole('button', { name: /Semua Waktu/ })).toBeTruthy();
        expect(onDateChange).not.toHaveBeenCalled();
    });
});
