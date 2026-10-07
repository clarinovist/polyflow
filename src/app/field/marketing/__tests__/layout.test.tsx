// @vitest-environment jsdom

import { Children, isValidElement, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MarketingMobileLayout from '../layout';
import FieldLayout from '../../layout';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';

const m = vi.hoisted(() => ({
    guard: vi.fn(),
    auth: vi.fn(),
    pathname: '/field/marketing/reviews',
}));
vi.mock('@/lib/mobile/mobile-portal-page-access', () => ({
    requireMobilePortalPageAccess: m.guard,
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/auth/access-policy', () => ({
    hasWorkspaceEntitlement: () => true,
}));
vi.mock('next/headers', () => ({
    headers: async () => new Headers({ 'user-agent': 'Android Mobile' }),
}));
vi.mock('next/navigation', () => ({
    usePathname: () => m.pathname,
    redirect: (path: string) => {
        throw new Error(`redirect:${path}`);
    },
}));
vi.mock('next/link', () => ({
    default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a {...props}>{children}</a>
    ),
}));
vi.mock('@/components/layout/mobile-account-menu-server', () => ({
    MobileAccountMenuServer: () => null,
}));

function findAccountMenu(node: ReactNode): Record<string, unknown> | undefined {
    for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode; header?: ReactNode; actions?: ReactNode; user?: unknown }>(child)) continue;
        if (child.type === MobileAccountMenuServer) return child.props;
        for (const nested of [child.props.children, child.props.header, child.props.actions]) {
            const result = findAccountMenu(nested);
            if (result) return result;
        }
    }
}

const user = { id: 'marketing-1', role: 'MARKETING' };

beforeEach(() => {
    vi.resetAllMocks();
    m.guard.mockResolvedValue({});
    m.auth.mockResolvedValue({ user });
    m.pathname = '/field/marketing/reviews';
});

describe('Marketing mobile route isolation', () => {
    it('keeps the /field parent route-neutral and gates the nested portal', async () => {
        const child = <p>Konten marketing</p>;
        const parent = await FieldLayout({ children: child });
        expect(parent).toBe(child);

        const tree = await MarketingMobileLayout({ children: child });
        expect(m.guard).toHaveBeenCalledWith('marketing-supervisor');
        expect(findAccountMenu(tree)?.user).toBe(user);
        render(tree);
        expect(screen.getAllByRole('navigation')).toHaveLength(1);
        expect(
            screen.queryByRole('navigation', { name: 'Navigasi sales lapangan' }),
        ).toBeNull();
        expect(screen.getByRole('main').id).toBe('field-marketing-content');
        expect(
            screen
                .getAllByRole('link')
                .filter((link) => link.getAttribute('aria-current') === 'page'),
        ).toHaveLength(1);
    });

    it('redirects unauthenticated /field before rendering a nested portal', async () => {
        m.auth.mockResolvedValue(null);
        await expect(FieldLayout({ children: null })).rejects.toThrow(
            'redirect:/login',
        );
        expect(m.guard).not.toHaveBeenCalled();
    });
});
