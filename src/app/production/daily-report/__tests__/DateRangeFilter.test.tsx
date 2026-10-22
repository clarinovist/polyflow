// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DateRangeFilter } from '../DateRangeFilter';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const currentMonth = { from: '2026-10-01', to: '2026-10-23', today: '2026-10-23' };
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;
const input = (name: string) => screen.getByLabelText(name) as HTMLInputElement;

beforeEach(() => push.mockReset());
afterEach(cleanup);

describe('daily report period filter', () => {
    it('marks the applied current month active and keeps Apply secondary and disabled', () => {
        render(<DateRangeFilter {...currentMonth} />);
        expect(input('Dari').value).toBe('2026-10-01');
        expect(input('Sampai').value).toBe('2026-10-23');
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('true');
        expect(button('Bulan ini').getAttribute('data-variant')).toBe('default');
        expect(button('Bulan lalu').getAttribute('aria-pressed')).toBe('false');
        expect(button('Terapkan').getAttribute('data-variant')).toBe('outline');
        expect(button('Terapkan').disabled).toBe(true);
        expect(push).not.toHaveBeenCalled();
    });

    it('applies a manual range only on submission and preserves the machine recap', () => {
        const view = render(<DateRangeFilter {...currentMonth} mesin="all" />);
        fireEvent.change(input('Dari'), { target: { value: '2026-10-05' } });
        expect(button('Terapkan').disabled).toBe(false);
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('false');
        expect(push).not.toHaveBeenCalled();
        fireEvent.submit(screen.getByRole('form', { name: 'Periode produksi' }));
        expect(push).toHaveBeenCalledExactlyOnceWith('/production/daily-report?from=2026-10-05&to=2026-10-23&mesin=all');
        view.rerender(<DateRangeFilter {...currentMonth} from="2026-10-05" mesin="all" />);
        expect(button('Terapkan').disabled).toBe(true);
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('false');
        expect(button('Bulan lalu').getAttribute('aria-pressed')).toBe('false');
    });

    it('disables Apply again when the draft is restored to the applied dates', () => {
        render(<DateRangeFilter {...currentMonth} />);
        fireEvent.change(input('Dari'), { target: { value: '2026-10-02' } });
        fireEvent.change(input('Dari'), { target: { value: '2026-10-01' } });
        expect(button('Terapkan').disabled).toBe(true);
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('true');
    });

    it('applies presets immediately, including returning from last month', () => {
        const view = render(<DateRangeFilter {...currentMonth} mesin="2026-08" />);
        fireEvent.click(button('Bulan lalu'));
        expect(push).toHaveBeenLastCalledWith('/production/daily-report?from=2026-09-01&to=2026-09-30&mesin=2026-08');
        view.rerender(<DateRangeFilter {...currentMonth} from="2026-09-01" to="2026-09-30" mesin="2026-08" />);
        expect(button('Bulan lalu').getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(button('Bulan ini'));
        expect(push).toHaveBeenLastCalledWith('/production/daily-report?from=2026-10-01&to=2026-10-23&mesin=2026-08');
    });

    it.each([
        ['2027-01-01', '2026-12-01', '2026-12-31'],
        ['2028-03-01', '2028-02-01', '2028-02-29'],
        ['2026-03-01', '2026-02-01', '2026-02-28'],
    ])('uses the server WIB date %s for year/month boundaries, not the browser clock', (today, from, to) => {
        render(<DateRangeFilter from={today} to={today} today={today} />);
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(button('Bulan lalu'));
        expect(push).toHaveBeenLastCalledWith(`/production/daily-report?from=${from}&to=${to}`);
    });

    it('restores the current preset even when its URL is already applied', () => {
        render(<DateRangeFilter {...currentMonth} />);
        fireEvent.change(input('Dari'), { target: { value: '2026-10-05' } });
        fireEvent.click(button('Bulan ini'));
        expect(input('Dari').value).toBe('2026-10-01');
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('true');
        expect(button('Terapkan').disabled).toBe(true);
    });

    it('resets stale drafts when back/forward navigation changes the applied period', () => {
        const view = render(<DateRangeFilter {...currentMonth} />);
        fireEvent.change(input('Dari'), { target: { value: '2026-10-05' } });
        view.rerender(<DateRangeFilter {...currentMonth} from="2026-09-01" to="2026-09-30" />);
        expect(input('Dari').value).toBe('2026-09-01');
        expect(input('Sampai').value).toBe('2026-09-30');
        expect(button('Bulan lalu').getAttribute('aria-pressed')).toBe('true');
        expect(button('Terapkan').disabled).toBe(true);
        view.rerender(<DateRangeFilter {...currentMonth} />);
        expect(input('Dari').value).toBe('2026-10-01');
        expect(button('Bulan ini').getAttribute('aria-pressed')).toBe('true');
    });

    it.each(['', '2026-10-24'])('does not submit an incomplete or inverted range (%s)', (from) => {
        render(<DateRangeFilter {...currentMonth} />);
        fireEvent.change(input('Dari'), { target: { value: from } });
        expect(button('Terapkan').disabled).toBe(true);
        fireEvent.submit(screen.getByRole('form', { name: 'Periode produksi' }));
        expect(push).not.toHaveBeenCalled();
    });
});
