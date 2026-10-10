import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ access: vi.fn(), redirect: vi.fn() }));
vi.mock('@/lib/mobile/mobile-account-access', () => ({
    resolveMobileAccountAccess: m.access,
}));
vi.mock('next/navigation', () => ({
    redirect: (path: string) => {
        m.redirect(path);
        throw new Error(`redirect:${path}`);
    },
}));
vi.mock('next/link', () => ({
    default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));
vi.mock('@/components/layout/mobile-account-menu-server', () => ({
    MobileAccountMenuServer: () => null,
}));
vi.mock('@/components/mobile', () => ({
    MobilePortalHeader: ({ title, actions }: { title: string; actions: ReactNode }) => (
        <header>{title}{actions}</header>
    ),
    MobilePortalShell: ({ children, header }: { children: ReactNode; header: ReactNode }) => (
        <div>{header}{children}</div>
    ),
}));
vi.mock('@/components/settings/ProfileSettings', () => ({
    ProfileSettings: () => null,
}));

import MobileAccountPage from '../page';
import { ProfileSettings } from '@/components/settings/ProfileSettings';
import { MobileAccountMenuServer } from '@/components/layout/mobile-account-menu-server';

function findProps(node: ReactNode, type: unknown): Record<string, unknown> | undefined {
    for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode; header?: ReactNode; actions?: ReactNode }>(child)) continue;
        if (child.type === type) return child.props as Record<string, unknown>;
        for (const nested of [child.props.children, child.props.header, child.props.actions]) {
            const result = findProps(nested, type);
            if (result) return result;
        }
    }
}

function countElements(node: ReactNode, type: unknown): number {
    let count = 0;
    for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode; header?: ReactNode; actions?: ReactNode }>(child)) continue;
        if (child.type === type) count += 1;
        count += countElements(child.props.children, type);
        count += countElements(child.props.header, type);
        count += countElements(child.props.actions, type);
    }
    return count;
}

const menuUser = { id: 'actor-a', name: 'Synthetic User', role: 'SALES' };
const profile = {
    id: 'actor-a',
    name: 'Synthetic User',
    email: 'staff@example.test',
    locale: 'id',
    avatarUrl: null,
    authMode: 'LOCAL',
};

beforeEach(() => {
    vi.resetAllMocks();
    m.access.mockResolvedValue({ status: 'allowed', menuUser, profile });
});

describe('mobile account page', () => {
    it.each([
        ['no-session', '/login'],
        ['desktop-only', '/device/desktop-required'],
    ] as const)('redirects %s sessions to %s', async (status, path) => {
        m.access.mockResolvedValue(
            status === 'no-session' ? { status } : { status, menuUser },
        );
        await expect(MobileAccountPage()).rejects.toThrow(`redirect:${path}`);
        expect(m.redirect).toHaveBeenCalledWith(path);
    });

    it.each(['tenant-context', 'user-not-found', 'account-inactive'] as const)(
        'renders a generic error for %s without a profile form',
        async (status) => {
            m.access.mockResolvedValue({ status, menuUser });
            const tree = await MobileAccountPage();
            expect(findProps(tree, ProfileSettings)).toBeUndefined();
            expect(JSON.stringify(tree)).toContain('Akun belum dapat dimuat');
            expect(JSON.stringify(tree)).not.toContain('database');
        },
    );

    it('renders only tenant profile data and suppresses the account self-link', async () => {
        const tree = await MobileAccountPage();
        expect(findProps(tree, ProfileSettings)).toMatchObject({
            userName: profile.name,
            userEmail: profile.email,
            userLocale: profile.locale,
            userAvatarUrl: null,
            authMode: 'LOCAL',
        });
        expect(findProps(tree, MobileAccountMenuServer)).toMatchObject({
            user: menuUser,
            hideAccountLink: true,
        });
        expect(findProps(tree, ProfileSettings)).not.toHaveProperty('id');
        expect(countElements(tree, 'h1')).toBe(1);
    });
});
