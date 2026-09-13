// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import HeroSectionEnhanced from '../hero-section-enhanced';
import PublicNavEnhanced from '../public-nav-enhanced';

function renderMarkup(element: ReactElement): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = renderToString(element);
    return root;
}

class IntersectionObserverMock implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = '0px';
    readonly scrollMargin = '0px';
    readonly thresholds = [0];

    disconnect(): void {}
    observe(): void {}
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
    unobserve(): void {}
}

async function expectHydratesWithoutErrors(element: ReactElement): Promise<void> {
    const container = document.createElement('div');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
    let root: Root | undefined;

    try {
        container.innerHTML = renderToString(element);
        await act(async () => {
            root = hydrateRoot(container, element);
        });

        expect(consoleError).not.toHaveBeenCalled();
    } finally {
        if (root) {
            await act(async () => root?.unmount());
        }
        vi.unstubAllGlobals();
        consoleError.mockRestore();
    }
}

function expectInitiallyVisible(element: Element | null): void {
    expect(element).not.toBeNull();

    let current: Element | null = element;
    while (current) {
        const style = current.getAttribute('style') ?? '';
        expect(style).not.toMatch(/(?:^|;)opacity:\s*0(?:;|$)/);
        expect(style).not.toMatch(/translateY\(-\d/);
        current = current.parentElement;
    }
}

describe('landing motion safety', () => {
    it('keeps navigation and hero semantics visible in server markup', () => {
        const nav = renderMarkup(<PublicNavEnhanced />);
        const hero = renderMarkup(<HeroSectionEnhanced />);

        expectInitiallyVisible(nav.querySelector('header'));
        expectInitiallyVisible(nav.querySelector('a[href="/login"]'));
        expectInitiallyVisible(hero.querySelector('h1'));
        expectInitiallyVisible(hero.querySelector('a[href^="mailto:"]'));
    });

    it('keeps mobile hero content shrinkable and allows long labels to wrap', () => {
        const hero = renderMarkup(<HeroSectionEnhanced />);
        const headline = hero.querySelector('h1');
        const badge = hero.querySelector('h1')?.parentElement?.querySelector('span');
        const stats = Array.from(
            hero.querySelectorAll('p'),
        ).filter((element) =>
            [
                'Modul Terintegrasi',
                'Platform Terpadu',
                'Pelacakan Real-time',
            ].includes(element.textContent ?? ''),
        );

        expect(headline?.className).toContain('break-words');
        expect(badge?.className).toContain('break-words');
        expect(stats).toHaveLength(3);
        for (const stat of stats) {
            expect(stat.className).toContain('break-words');
            expect(stat.className).not.toContain('whitespace-nowrap');
        }
    });

    it('uses clear Indonesian proof points and connected-flow terminology', () => {
        const hero = renderMarkup(<HeroSectionEnhanced />);

        expect(hero.textContent).toContain('Industri Konversi Plastik');
        expect(hero.textContent).toContain('Platform Terpadu');
        expect(hero.textContent).toContain('24/7');
        expect(hero.textContent).toContain('Terhubung');
        expect(hero.textContent).not.toContain('Sistem, Bukan Taburan');
        expect(hero.textContent).not.toContain('sync');
    });

    it('keeps the complete home composition, including footer semantics, visible by default', () => {
        const home = renderMarkup(<Home />);
        const footer = home.querySelector('footer');

        expectInitiallyVisible(home.querySelector('main h1'));
        expectInitiallyVisible(footer?.querySelector('h3') ?? null);
        expectInitiallyVisible(
            footer?.querySelector('a[href="/register"]') ?? null,
        );
        expectInitiallyVisible(
            footer?.querySelector('a[href="/privacy"]') ?? null,
        );
        expectInitiallyVisible(footer?.querySelector('p:last-child') ?? null);
    });

    it('hydrates the complete home composition without console errors', async () => {
        await expectHydratesWithoutErrors(<Home />);
    });
});
