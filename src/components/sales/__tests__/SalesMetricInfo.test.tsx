// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesMetricInfo } from '../SalesMetricInfo';

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const help = <SalesMetricInfo label="Info metrik">Penjelasan metrik</SalesMetricInfo>;

describe('SalesMetricInfo', () => {
    it('is collapsed initially and has an accessible button name', () => {
        render(help);
        expect(screen.getByRole('button', { name: 'Info metrik' }).getAttribute('type')).toBe('button');
        expect(screen.queryByRole('tooltip')).toBeNull();
    });

    it('opens on keyboard focus and can be dismissed using Escape', async () => {
        render(help);
        const trigger = screen.getByRole('button', { name: 'Info metrik' });
        fireEvent.focus(trigger);
        const tooltip = await screen.findByRole('tooltip');
        expect(trigger.getAttribute('aria-describedby')).toBe(tooltip.id);
        fireEvent.keyDown(trigger, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    });

    it('toggles on click/tap instead of immediately closing via Radix default handling', async () => {
        render(help);
        const trigger = screen.getByRole('button', { name: 'Info metrik' });
        fireEvent.pointerDown(trigger, { pointerType: 'touch' });
        fireEvent.click(trigger);
        expect(await screen.findByRole('tooltip')).toBeTruthy();
        fireEvent.pointerDown(trigger, { pointerType: 'touch' });
        fireEvent.click(trigger);
        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    });

    it('closes on blur', async () => {
        render(help);
        const trigger = screen.getByRole('button', { name: 'Info metrik' });
        fireEvent.focus(trigger);
        await screen.findByRole('tooltip');
        fireEvent.blur(trigger);
        await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    });
});
