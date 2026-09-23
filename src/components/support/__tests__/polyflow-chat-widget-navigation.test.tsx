// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ path: '/finance', authenticated: true }));
vi.mock('next/navigation', () => ({ usePathname: () => state.path }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ status: state.authenticated ? 'authenticated' : 'unauthenticated', data: state.authenticated ? { user: { id: 'fixture' } } : null }) }));
vi.mock('../polyflow-chat-panel', () => ({ PolyflowChatPanel: () => <input aria-label="Draft message" /> }));
import { PolyflowChatWidget } from '../polyflow-chat-widget';
let desktop = true;
let resize: () => void;
beforeEach(() => {
    state.path = '/finance'; state.authenticated = true; desktop = true;
    vi.stubGlobal('matchMedia', () => ({ get matches() { return desktop; }, addEventListener: (_: string, callback: () => void) => { resize = callback; }, removeEventListener: vi.fn() }));
});
const renderWidget = () => render(<><div id="finance-assistant-desktop" /><div id="finance-assistant-mobile" /><PolyflowChatWidget /></>);
describe('finance navigation assistant', () => {
    it('moves one authenticated launcher between reserved slots, preserving the panel and draft', () => {
        renderWidget();
        const trigger = screen.getByRole('button', { name: 'Buka Asisten Polyflow' });
        expect(trigger.parentElement?.id).toBe('finance-assistant-desktop');
        expect(document.querySelector('[data-polyflow-chat-fab]')).toBeNull();
        fireEvent.click(trigger);
        fireEvent.change(screen.getByLabelText('Draft message'), { target: { value: 'Keep draft' } });
        act(() => { desktop = false; resize(); });
        expect(screen.getByRole('button', { name: 'Minimize Asisten Polyflow' }).parentElement?.id).toBe('finance-assistant-mobile');
        expect((screen.getByLabelText('Draft message') as HTMLInputElement).value).toBe('Keep draft');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Buka Asisten Polyflow' }));
    });
    it('does not close on pointerdown in the portalled trigger and minimizes with focus return', () => {
        renderWidget(); fireEvent.click(screen.getByRole('button'));
        const trigger = screen.getByRole('button', { name: 'Minimize Asisten Polyflow' });
        fireEvent.pointerDown(trigger);
        expect(screen.getByRole('dialog')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Minimize asisten' }));
        expect(document.activeElement).toBe(trigger);
    });
    it('leaves Escape to an active transaction modal', () => {
        renderWidget(); fireEvent.click(screen.getByRole('button'));
        const modal = document.createElement('div'); modal.setAttribute('role', 'alertdialog'); document.body.append(modal);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.getByRole('dialog')).toBeTruthy(); modal.remove();
    });
    it('keeps other portals and the dedicated mobile portal floating', () => {
        state.path = '/warehouse'; const { rerender } = render(<PolyflowChatWidget />);
        expect(document.querySelector('[data-desktop-safe-area]')).toBeTruthy();
        state.path = '/finance/mobile'; rerender(<PolyflowChatWidget />);
        expect(document.querySelector('[data-mobile-safe-area]')).toBeTruthy();
    });
    it('docks sales navigation without creating a second chat owner or losing drafts on resize', () => {
        state.path = '/sales/orders/create';
        render(<><div id="sales-assistant-desktop" /><div id="sales-assistant-mobile" /><PolyflowChatWidget /></>);
        const trigger = screen.getByRole('button', { name: 'Buka Asisten Polyflow' });
        expect(trigger.parentElement?.id).toBe('sales-assistant-desktop');
        expect(document.querySelector('[data-polyflow-chat-fab]')).toBeNull();
        fireEvent.click(trigger);
        fireEvent.change(screen.getByLabelText('Draft message'), { target: { value: 'Synthetic draft' } });
        act(() => { desktop = false; resize(); });
        expect(screen.getByRole('button', { name: 'Minimize Asisten Polyflow' }).parentElement?.id).toBe('sales-assistant-mobile');
        expect((screen.getByLabelText('Draft message') as HTMLInputElement).value).toBe('Synthetic draft');
        expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
    it.each(['/sales/mobile', '/finance/mobile'])('keeps %s on the mobile launcher', (path) => {
        state.path = path; render(<PolyflowChatWidget />);
        expect(document.querySelector('[data-mobile-safe-area]')).toBeTruthy();
    });
    it('preserves the disabled widget on the dedicated field portal', () => {
        state.path = '/field/sales'; render(<PolyflowChatWidget />);
        expect(screen.queryByRole('button')).toBeNull();
    });
    it('does not render a launcher for unauthenticated users', () => {
        state.authenticated = false; renderWidget(); expect(screen.queryByRole('button')).toBeNull();
    });
});
