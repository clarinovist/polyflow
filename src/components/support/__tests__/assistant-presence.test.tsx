// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantPresence, BREAK_ACTIVE_MS, PRESENCE_TICK_MS, assistantPageGuide } from '../use-assistant-presence';
import { AssistantPresenceOffer, AssistantPresenceSettings } from '../assistant-presence-controls';
function Harness({ path = '/finance/returns', open = false }: { path?: string; open?: boolean }) {
    const presence = useAssistantPresence('synthetic', path, open);
    return <><AssistantPresenceSettings presence={presence} /><AssistantPresenceOffer presence={presence} docked /><input aria-label="Transaction field" /></>;
}
function activeFor(ms: number) {
    for (let i = 0; i < ms / PRESENCE_TICK_MS; i++) {
        fireEvent.scroll(window);
        act(() => vi.advanceTimersByTime(PRESENCE_TICK_MS));
    }
}
beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T10:00:00Z'));
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('consensual non-intrusive assistant presence', () => {
    it('is off by default, has no autonomous chat/AI calls, and offers explicit controls', () => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        render(<Harness />); activeFor(BREAK_ACTIVE_MS);
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
        expect((screen.getByLabelText('Tawarkan panduan halaman') as HTMLInputElement).checked).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });
    it('offers a verified page guide once, without moving focus', () => {
        render(<Harness />);
        fireEvent.click(screen.getByLabelText('Tawarkan panduan halaman'));
        const focus = document.activeElement;
        activeFor(120_000);
        expect(screen.getByRole('link', { name: 'Buka panduan' }).getAttribute('href')).toBe('/support/cara-retur-penjualan-dan-kredit-finance');
        expect(document.activeElement).toBe(focus);
        fireEvent.click(screen.getByRole('button', { name: 'Tetap fokus' }));
        activeFor(BREAK_ACTIVE_MS);
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
    });
    it('counts activity rather than open-tab time, then provides a local joke and opt-out', () => {
        render(<Harness path="/dashboard" />);
        fireEvent.click(screen.getByLabelText('Tawarkan jokes ringan setelah 1 jam aktif'));
        act(() => vi.advanceTimersByTime(BREAK_ACTIVE_MS * 2));
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
        activeFor(BREAK_ACTIVE_MS);
        expect(screen.getByText('Mau selingan sebentar?')).toBeTruthy();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Jokes ringan' }));
        fireEvent.click(screen.getByRole('button', { name: 'Jokes ringan' }));
        expect(screen.getByText(/Kenapa kalender/)).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Jangan tawarkan lagi' }));
        expect(JSON.parse(window.localStorage.getItem('polyflow:assistant-presence:v1:synthetic')!)).toEqual({ help: false, breaks: false });
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
    });
    it('suppresses offers while typing and while chat is open', () => {
        const view = render(<Harness />);
        fireEvent.click(screen.getByLabelText('Tawarkan panduan halaman'));
        screen.getByLabelText('Transaction field').focus(); activeFor(180_000);
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
        (document.activeElement as HTMLElement).blur();
        view.rerender(<Harness open />); activeFor(BREAK_ACTIVE_MS);
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
    });
    it('suppresses hidden tabs, modal transactions, and visible errors', () => {
        render(<Harness />); fireEvent.click(screen.getByLabelText('Tawarkan panduan halaman'));
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); activeFor(180_000);
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
        const alert = document.createElement('div'); alert.setAttribute('role', 'alert'); document.body.append(alert);
        vi.spyOn(alert, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
        activeFor(180_000); expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
        alert.setAttribute('role', 'alertdialog'); activeFor(180_000); expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
        alert.remove();
    });
    it('responds to opt-out from another tab and tolerates unavailable storage', () => {
        render(<Harness />); fireEvent.click(screen.getByLabelText('Tawarkan panduan halaman'));
        fireEvent(window, new StorageEvent('storage', { key: 'polyflow:assistant-presence:v1:synthetic', newValue: '{"help":false,"breaks":false}' }));
        expect((screen.getByLabelText('Tawarkan panduan halaman') as HTMLInputElement).checked).toBe(false);
        vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw Error('blocked'); });
        fireEvent.click(screen.getByLabelText('Tawarkan panduan halaman')); activeFor(120_000);
        expect(screen.getByLabelText('Sapaan Asisten')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Tetap fokus' })); activeFor(180_000);
        expect(screen.queryByLabelText('Sapaan Asisten')).toBeNull();
    });
    it('does not invent guide links for unknown pages', () => {
        expect(assistantPageGuide('/finance/returns/create')).toBe('/support/cara-retur-dan-potong-tagihan');
        expect(assistantPageGuide('/purchasing/orders/example')).toContain('menutup-po');
        expect(assistantPageGuide('/finance/returns-other')).toBeNull();
        expect(assistantPageGuide('/profile')).toBeNull();
    });
});
