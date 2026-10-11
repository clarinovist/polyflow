// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InfoHint } from '../InfoHint';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

describe('InfoHint', () => {
    it('has an accessible name and toggles supplemental help by pointer', () => {
        render(
            <InfoHint label="Penjelasan omzet">
                <p>Omzet bersih setelah retur.</p>
            </InfoHint>,
        );

        const trigger = screen.getByRole('button', {
            name: 'Penjelasan omzet',
        });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(trigger, { detail: 1 });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('tooltip').textContent).toContain(
            'Omzet bersih setelah retur',
        );

        fireEvent.click(trigger, { detail: 1 });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });

    it('opens on focus, keeps Enter activation open, and closes with Escape', () => {
        render(
            <InfoHint label="Penjelasan kas">
                <p>Saldo sampai akhir hari.</p>
            </InfoHint>,
        );

        const trigger = screen.getByRole('button', {
            name: 'Penjelasan kas',
        });
        fireEvent.focus(trigger);
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(trigger, { key: 'Enter' });
        fireEvent.click(trigger, { detail: 0 });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(trigger, { key: ' ' });
        fireEvent.click(trigger, { detail: 0 });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');

        fireEvent.keyDown(trigger, { key: 'Escape' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
});
