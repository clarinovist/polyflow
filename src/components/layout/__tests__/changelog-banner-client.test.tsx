// @vitest-environment jsdom

import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangelogBannerClient } from '../changelog-banner-client';

vi.mock('next/navigation', () => ({ usePathname: () => '/finance' }));
vi.mock('@/components/ui/button', () => ({
    Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button {...props}>{children}</button>
    ),
}));
vi.mock('@/components/ui/card', () => ({
    Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ChangelogBannerClient assistant coordination', () => {
    beforeEach(() => {
        const values = new Map<string, string>();
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: {
                getItem: (key: string) => values.get(key) ?? null,
                setItem: (key: string, value: string) => values.set(key, value),
                clear: () => values.clear(),
            },
        });
    });

    it('hides while the assistant is open and returns when it closes', () => {
        render(<ChangelogBannerClient version="test" notesHtml="Notes" />);
        expect(screen.getByText("What's New in test")).toBeTruthy();

        act(() => window.dispatchEvent(new Event('polyflow-assistant-open')));
        expect(screen.queryByText("What's New in test")).toBeNull();

        act(() => window.dispatchEvent(new Event('polyflow-assistant-close')));
        expect(screen.getByText("What's New in test")).toBeTruthy();
    });
});
