// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pathname = '/warehouse/mobile/incoming';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { WarehouseBottomNav } from '../WarehouseBottomNav';

describe('WarehouseBottomNav', () => {
    it('provides a safe-area-aware labeled nav with touch-sized links', () => {
        render(<WarehouseBottomNav />);

        const nav = screen.getByRole('navigation', {
            name: 'Navigasi gudang mobile',
        });
        expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(4);
        for (const link of links) expect(link.className).toContain('min-h-11');
        const currentLinks = links.filter(
            (link) => link.getAttribute('aria-current') === 'page',
        );
        expect(currentLinks).toHaveLength(1);
        expect(currentLinks[0]).toBe(screen.getByRole('link', { name: 'Terima' }));
    });
});
