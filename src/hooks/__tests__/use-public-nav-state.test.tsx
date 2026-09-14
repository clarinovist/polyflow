// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePublicNavState } from '../use-public-nav-state';

function PublicNavStateHarness() {
    const { scrolled, mobileOpen, setMobileOpen, mobileMenuButton } =
        usePublicNavState();

    return (
        <button
            ref={mobileMenuButton}
            type="button"
            aria-expanded={mobileOpen}
            data-scrolled={scrolled}
            onClick={() => setMobileOpen(!mobileOpen)}
        >
            Menu
        </button>
    );
}

describe('usePublicNavState', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        Object.defineProperty(window, 'scrollY', {
            configurable: true,
            value: 0,
        });
    });

    it('tracks whether the public navigation has crossed the scroll threshold', () => {
        render(<PublicNavStateHarness />);
        const button = screen.getByRole('button', { name: 'Menu' });

        expect(button.dataset.scrolled).toBe('false');

        Object.defineProperty(window, 'scrollY', {
            configurable: true,
            value: 20,
        });
        act(() => window.dispatchEvent(new Event('scroll')));
        expect(button.dataset.scrolled).toBe('false');

        Object.defineProperty(window, 'scrollY', {
            configurable: true,
            value: 21,
        });
        act(() => window.dispatchEvent(new Event('scroll')));

        expect(button.dataset.scrolled).toBe('true');
    });

    it('ignores keys other than Escape while the mobile menu is open', () => {
        render(<PublicNavStateHarness />);
        const button = screen.getByRole('button', { name: 'Menu' });

        fireEvent.click(button);
        fireEvent.keyDown(document, { key: 'Enter' });

        expect(button.getAttribute('aria-expanded')).toBe('true');
    });

    it('closes the mobile menu with Escape and restores focus', () => {
        render(<PublicNavStateHarness />);
        const button = screen.getByRole('button', { name: 'Menu' });

        fireEvent.click(button);
        expect(button.getAttribute('aria-expanded')).toBe('true');

        act(() => button.blur());
        fireEvent.keyDown(document, { key: 'Escape' });

        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button).toBe(document.activeElement);
    });

    it('removes its window listener when unmounted', () => {
        const removeEventListener = vi.spyOn(window, 'removeEventListener');
        const { unmount } = render(<PublicNavStateHarness />);

        unmount();

        expect(removeEventListener).toHaveBeenCalledWith(
            'scroll',
            expect.any(Function),
        );
    });
});
