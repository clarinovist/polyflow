import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

const subscribe = (listener: () => void) => {
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
};

/** Emulates Next's native History integration, not available in jsdom. */
export function useTestSearchParams() {
    const search = useSyncExternalStore(subscribe, () => window.location.search, () => '');
    return new URLSearchParams(search);
}

export function installHistoryIntegration() {
    const pushState = window.history.pushState.bind(window.history);
    return vi.spyOn(window.history, 'pushState').mockImplementation((data, unused, url) => {
        pushState(data, unused, url);
        window.dispatchEvent(new PopStateEvent('popstate'));
    });
}
