// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { TransactionDateFilter } from '../transaction-date-filter';

afterEach(cleanup);

describe('transaction date filter upper-only bounds', () => {
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
