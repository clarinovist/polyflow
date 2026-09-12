// @vitest-environment jsdom

import { act } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveClockBar, formatWibUpdateTime } from '../LiveClockBar';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('LiveClockBar', () => {
    it('shows an explicit WIB refresh timestamp and Indonesian refresh label', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-13T05:34:56.000Z'));

        render(
            <LiveClockBar
                onRefresh={vi.fn()}
                isLoading={false}
                lastUpdated={new Date('2026-09-13T05:34:56.000Z')}
            />,
        );
        await act(async () => {});

        expect(formatWibUpdateTime(new Date('2026-09-13T05:34:56.000Z'))).toBe(
            '12.34.56',
        );
        expect(screen.getByText(/Diperbarui pukul 12\.34\.56 WIB/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Segarkan/ })).toBeTruthy();
    });

    it('hydrates server HTML without deriving the initial clock or shift from client time', async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-13T05:34:56.000Z'));

        const props = {
            onRefresh: vi.fn(),
            isLoading: false,
            lastUpdated: new Date('2026-09-13T05:34:56.000Z'),
        };
        const serverHtml = renderToString(<LiveClockBar {...props} />);
        const container = document.createElement('div');
        container.innerHTML = serverHtml;
        document.body.appendChild(container);

        expect(container.querySelector('.invisible[aria-hidden="true"]')).not.toBeNull();

        vi.setSystemTime(new Date('2026-09-13T16:34:56.000Z'));
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        let root: ReturnType<typeof hydrateRoot> | undefined;
        await act(async () => {
            root = hydrateRoot(container, <LiveClockBar {...props} />);
        });

        expect(
            consoleError.mock.calls.some((call) =>
                call.some((value) =>
                    String(value).toLowerCase().includes('hydration'),
                ),
            ),
        ).toBe(false);
        expect(container.querySelector('.invisible[aria-hidden="true"]')).toBeNull();
        expect(container.textContent).toContain('23.34.56 WIB');
        expect(container.textContent).toContain('Shift Malam');

        await act(async () => {
            root?.unmount();
        });
        container.remove();
    });
});
