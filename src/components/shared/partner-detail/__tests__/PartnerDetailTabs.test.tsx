// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PartnerDetailTabs, resolvePartnerTab, type PartnerDetailTabGroup } from '../PartnerDetailTabs';
import { usePartnerDetailTab } from '../use-partner-detail-tab';
import { installHistoryIntegration } from './navigation-mock';

vi.mock('next/navigation', async () => {
    const { useTestSearchParams } = await import('./navigation-mock');
    return { useSearchParams: useTestSearchParams };
});
const groups: PartnerDetailTabGroup[] = [
    { value: 'overview', label: 'Ringkasan', tabs: [{ value: 'overview', label: 'Ringkasan' }] },
    { value: 'transactions', label: 'Transaksi', tabs: [{ value: 'orders', label: 'Pesanan' }, { value: 'returns', label: 'Retur' }] },
];
function Harness() {
    const [value, select] = usePartnerDetailTab(groups);
    return <><PartnerDetailTabs groups={groups} value={value} onValueChange={select}><p>Konten {value}</p></PartnerDetailTabs>
        <button onClick={() => select(value)}>Pilih ulang</button><button onClick={() => select('bad-value')}>Fallback</button></>;
}
beforeEach(() => { window.history.replaceState(null, '', '/detail?filter=active#anchor'); installHistoryIntegration(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('partner detail navigation', () => {
    it('validates legacy leaf values and falls back from absent or unknown values', () => {
        expect(resolvePartnerTab(groups, 'returns')).toBe('returns');
        expect(resolvePartnerTab(groups, 'bad')).toBe('overview');
        expect(resolvePartnerTab(groups, '')).toBe('overview');
        expect(resolvePartnerTab(groups)).toBe('overview');
        expect(resolvePartnerTab(groups, null)).toBe('overview');
    });

    it('preserves other query parameters/hash and selects the first leaf of a group', () => {
        render(<Harness />);
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Transaksi' }), { button: 0, ctrlKey: false });
        expect(screen.getByText('Konten orders')).toBeDefined();
        expect(window.location.search).toBe('?filter=active&tab=orders');
        expect(window.location.hash).toBe('#anchor');
        fireEvent.mouseDown(screen.getByRole('tab', { name: 'Retur' }), { button: 0, ctrlKey: false });
        expect(screen.getByText('Konten returns')).toBeDefined();
        expect(window.location.search).toBe('?filter=active&tab=returns');
        const pushes = vi.mocked(window.history.pushState).mock.calls.length;
        fireEvent.click(screen.getByRole('button', { name: 'Pilih ulang' }));
        expect(window.history.pushState).toHaveBeenCalledTimes(pushes);
        fireEvent.click(screen.getByRole('button', { name: 'Fallback' }));
        expect(screen.getByText('Konten overview')).toBeDefined();
    });

    it('tracks back/forward popstate and removing the tab parameter without stale state', () => {
        render(<Harness />);
        for (const tab of ['returns', 'orders', 'unknown', '']) {
            act(() => {
                window.history.replaceState(null, '', tab ? `/detail?tab=${tab}` : '/detail');
                window.dispatchEvent(new PopStateEvent('popstate'));
            });
            expect(screen.getByText(`Konten ${tab === 'unknown' || !tab ? 'overview' : tab}`)).toBeDefined();
        }
    });

    it('has linked ARIA panels and supports keyboard activation of nested tabs', () => {
        window.history.replaceState(null, '', '/detail?tab=orders');
        render(<Harness />);
        const tabs = within(screen.getByRole('tablist', { name: 'Transaksi' }));
        const trigger = tabs.getByRole('tab', { name: 'Retur' });
        act(() => trigger.focus());
        fireEvent.keyDown(trigger, { key: 'Enter' });
        expect(trigger.getAttribute('aria-selected')).toBe('true');
        const panel = document.getElementById(trigger.getAttribute('aria-controls')!);
        expect(panel?.getAttribute('role')).toBe('tabpanel');
        expect(panel?.getAttribute('aria-labelledby')).toBe(trigger.id);
        expect(panel?.textContent).toBe('Konten returns');
    });
});
