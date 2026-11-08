// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopViewButton } from '../DesktopViewButton';

const assignMock = vi.hoisted(() => vi.fn());

function installMemoryStorage(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => void store.set(key, value),
            removeItem: (key: string) => void store.delete(key),
        },
    });
}

describe('DesktopViewButton', () => {
    beforeEach(() => {
        document.cookie = 'bypass_mobile=; path=/; max-age=0';
        installMemoryStorage();
        vi.stubGlobal('location', { protocol: 'https:', assign: assignMock });
        assignMock.mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('opens the desktop dashboard in one tap using the default 24 hours', () => {
        render(<DesktopViewButton />);

        fireEvent.click(
            screen.getByRole('button', { name: /buka versi desktop/i }),
        );

        expect(document.cookie).toContain('bypass_mobile=true');
        expect(assignMock).toHaveBeenCalledWith('/dashboard');
    });

    it('shows the remembered duration after mount', async () => {
        installMemoryStorage({ 'polyflow.desktopViewDays': '7' });
        render(<DesktopViewButton />);

        expect(await screen.findByText('(7 hari)')).toBeTruthy();
    });
});
