// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let pathname = '/field/marketing';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));

import { MarketingBottomNav } from '../MarketingBottomNav';

afterEach(cleanup);

describe('MarketingBottomNav', () => {
    it.each([
        ['/field/marketing', '/field/marketing'],
        ['/field/marketing/team', '/field/marketing/team'],
        ['/field/marketing/reviews', '/field/marketing/reviews'],
        ['/field/marketing/insights/detail', '/field/marketing/insights'],
    ])('marks exactly one destination current for %s', (current, href) => {
        pathname = current;
        render(<MarketingBottomNav />);
        const nav = screen.getByRole('navigation', {
            name: 'Navigasi marketing supervisor',
        });
        expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
        const links = screen
            .getAllByRole('link')
            .filter((link) => link.closest('nav') === nav);
        expect(links).toHaveLength(4);
        for (const link of links) expect(link.className).toContain('min-h-12');
        const currentLinks = links.filter(
            (link) => link.getAttribute('aria-current') === 'page',
        );
        expect(currentLinks).toHaveLength(1);
        expect(currentLinks[0].getAttribute('href')).toBe(href);
    });
});
