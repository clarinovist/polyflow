// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const pathname = '/field/sales/orders';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/lib/auth/permission-match', () => ({ canSeeNavHref: () => true }));

import { FieldBottomNav } from '../FieldBottomNav';

describe('FieldBottomNav', () => {
    it('labels the navigation, marks the active route, and keeps touch targets large', () => {
        render(<FieldBottomNav permissions="ALL" badges={{ stock: 3 }} />);

        const nav = screen.getByRole('navigation', {
            name: 'Navigasi sales lapangan',
        });
        expect(nav.className).toContain('pb-[env(safe-area-inset-bottom)]');
        const links = screen.getAllByRole('link');
        expect(links).toHaveLength(6);
        for (const link of links) expect(link.className).toContain('min-h-12');
        expect(
            screen.getByRole('link', { name: 'Order' }).getAttribute(
                'aria-current',
            ),
        ).toBe('page');
        expect(screen.getByText('3')).toBeTruthy();
    });
});
