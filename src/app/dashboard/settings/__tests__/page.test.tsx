import { Children, isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
    auth: vi.fn(),
    tenantDb: vi.fn(),
    findUser: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('next/headers', () => ({
    headers: async () => new Headers({
        host: 'tenant-a.example.test',
        'x-tenant-subdomain': 'tenant-a',
    }),
}));
vi.mock('@/lib/core/tenant', () => ({
    extractSubdomain: vi.fn(),
    withTenantPage: (fn: (...args: never[]) => Promise<unknown>) => fn,
}));
vi.mock('@/lib/core/prisma', () => ({
    getTenantDbFromContext: m.tenantDb,
}));
vi.mock('@/lib/auth/access-policy', () => ({
    getTenantActiveModules: () => [],
}));
vi.mock('@/lib/auth/central-oidc-config', () => ({
    isCentralSsoConfigured: () => false,
}));
vi.mock('@/components/support/contextual-help', () => ({
    ContextualHelp: () => null,
}));
vi.mock('@/components/settings/SettingsTabs', () => ({
    SettingsTabs: () => null,
}));

import SettingsPage from '../page';
import { SettingsTabs } from '@/components/settings/SettingsTabs';

function findProps(node: ReactNode, type: unknown): Record<string, unknown> | undefined {
    for (const child of Children.toArray(node)) {
        if (!isValidElement<{ children?: ReactNode }>(child)) continue;
        if (child.type === type) return child.props as Record<string, unknown>;
        const result = findProps(child.props.children, type);
        if (result) return result;
    }
}

beforeEach(() => {
    vi.resetAllMocks();
    m.auth.mockResolvedValue({
        user: {
            id: 'actor-a',
            name: 'Synthetic User',
            email: 'staff@example.test',
            role: 'SALES',
            roles: ['SALES'],
        },
    });
    m.tenantDb.mockReturnValue({ user: { findUnique: m.findUser } });
    m.findUser.mockResolvedValue({
        locale: 'id',
        avatarUrl: null,
        authMode: 'CENTRAL',
    });
});

describe('desktop settings profile tenant boundary', () => {
    it('reads profile and auth mode only from the explicit tenant client', async () => {
        const tree = await SettingsPage();
        expect(m.findUser).toHaveBeenCalledWith({
            where: { id: 'actor-a' },
            select: { locale: true, avatarUrl: true, authMode: true },
        });
        expect(findProps(tree, SettingsTabs)).toMatchObject({
            currentUserLocale: 'id',
            currentUserAvatarUrl: null,
            currentUserAuthMode: 'CENTRAL',
        });
    });

    it('fails closed with a generic message when tenant context is absent', async () => {
        m.tenantDb.mockReturnValue(undefined);
        const tree = await SettingsPage();
        expect(m.findUser).not.toHaveBeenCalled();
        expect(findProps(tree, SettingsTabs)).toBeUndefined();
        expect(JSON.stringify(tree)).toContain(
            'Profil akun belum dapat dimuat untuk perusahaan aktif.',
        );
    });
});
