// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import PublicNav from '../public-nav';
import PublicNavEnhanced from '../public-nav-enhanced';

for (const [name, Navigation] of [
    ['landing', PublicNavEnhanced],
    ['register', PublicNav],
] as const) {
    describe(`${name} public mobile navigation`, () => {
        afterEach(() => document.body.replaceChildren());

        it('exposes localized state, touch sizing, dismisses with Escape, and restores focus', () => {
            render(<Navigation />);
            const openButton = screen.getByRole('button', { name: /Buka menu/i });
            expect(openButton.getAttribute('aria-expanded')).toBe('false');
            expect(openButton.className).toContain('min-h-11');
            fireEvent.click(openButton);

            const closeButton = screen.getByRole('button', { name: /Tutup menu/i });
            expect(closeButton.getAttribute('aria-expanded')).toBe('true');
            const controlledId = closeButton.getAttribute('aria-controls');
            expect(controlledId).toBeTruthy();
            expect(document.getElementById(controlledId ?? '')).toBeTruthy();

            act(() => closeButton.focus());
            fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
            expect(screen.getByRole('button', { name: /Buka menu/i })).toBe(
                document.activeElement,
            );
            expect(
                screen.getAllByRole('link', { name: 'Fitur' }).length,
            ).toBeGreaterThan(0);
            expect(
                screen.getAllByRole('link', { name: 'Kenapa PolyFlow' }).length,
            ).toBeGreaterThan(0);
            expect(
                screen.getAllByRole('link', { name: 'Login Tenant' }).length,
            ).toBeGreaterThan(0);
        });
    });
}
