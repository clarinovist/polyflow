// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LiveClockBar, formatWibUpdateTime } from '../LiveClockBar';

describe('LiveClockBar', () => {
    it('formats server freshness in WIB and invokes refresh', () => {
        const onRefresh = vi.fn();
        const generatedAt = '2026-10-09T08:00:00.000Z';
        render(
            <LiveClockBar
                onRefresh={onRefresh}
                isLoading={false}
                generatedAt={generatedAt}
                kioskHref="/kiosk"
            />,
        );
        expect(screen.getByRole('status').textContent).toContain(
            formatWibUpdateTime(new Date(generatedAt)),
        );
        fireEvent.click(screen.getByRole('button', { name: /Segarkan/ }));
        expect(onRefresh).toHaveBeenCalledOnce();
        expect(screen.getByRole('link', { name: /Kiosk/ })).toBeTruthy();
    });

    it('shows loading and hides ungranted kiosk link', () => {
        render(
            <LiveClockBar
                onRefresh={vi.fn()}
                isLoading
                generatedAt="invalid"
                kioskHref={null}
            />,
        );
        expect(screen.getByText('Memperbarui…')).toBeTruthy();
        expect(screen.queryByRole('link', { name: /Kiosk/ })).toBeNull();
    });
});
