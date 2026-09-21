// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveClockBar, formatWibUpdateTime } from '../LiveClockBar';
afterEach(cleanup);

describe('LiveClockBar data freshness', () => {
    it('shows WIB update time and refresh action without a second clock or invented shift', () => {
        const refresh = vi.fn();
        render(<LiveClockBar onRefresh={refresh} isLoading={false} lastUpdated={new Date('2026-09-13T05:34:56Z')} />);
        expect(formatWibUpdateTime(new Date('2026-09-13T05:34:56Z'))).toBe('12.34.56');
        expect(screen.getByRole('status').textContent).toContain('Diperbarui pukul 12.34.56 WIB');
        expect(screen.queryByText(/Shift/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Segarkan' }));
        expect(refresh).toHaveBeenCalledOnce();
    });
    it('has honest initial/loading states', () => {
        const view = render(<LiveClockBar onRefresh={vi.fn()} isLoading={false} lastUpdated={null} />);
        expect(screen.getByRole('status').textContent).toBe('Menunggu pembaruan');
        view.rerender(<LiveClockBar onRefresh={vi.fn()} isLoading lastUpdated={null} />);
        expect(screen.getByRole('status').textContent).toBe('Memperbarui…');
        expect((screen.getByRole('button', { name: 'Segarkan' }) as HTMLButtonElement).disabled).toBe(true);
    });
});
