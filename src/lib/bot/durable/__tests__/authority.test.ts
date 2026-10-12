import { beforeEach, describe, expect, it, vi } from 'vitest';

const main = {
    tenant: { findFirst: vi.fn() },
    tenantModule: { findMany: vi.fn() },
    telegramAssistantLink: { findUnique: vi.fn(), updateMany: vi.fn() },
    tenantMembership: { findFirst: vi.fn() },
    assistantDurableBinding: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        upsert: vi.fn(),
    },
};
const tenantDb = {
    helpConversation: { findFirst: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn() },
    userRole: { findMany: vi.fn() },
    rolePermission: { findMany: vi.fn() },
};
vi.mock('@/lib/core/prisma', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    const tenantContext = new AsyncLocalStorage<object>();
    const tenantIdContext = new AsyncLocalStorage<string>();
    const entitlementContext = new AsyncLocalStorage<string[]>();
    return {
        getMainPrisma: () => main,
        getTenantDb: () => tenantDb,
        tenantContext,
        tenantIdContext,
        entitlementContext,
        prisma: new Proxy(
            {},
            { get: (_target, key) => tenantContext.getStore()?.[key as never] },
        ),
    };
});
vi.mock('@/lib/core/actor-context', async () => {
    const { AsyncLocalStorage } = await import('node:async_hooks');
    return { actorContext: new AsyncLocalStorage() };
});
vi.mock('../feature-flags', () => ({ isFeatureEnabled: () => true }));

import { verifyDurableAuthority, withBoundAuthority } from '../authority';

beforeEach(() => {
    vi.clearAllMocks();
    main.tenant.findFirst.mockResolvedValue({ id: 'tenant-one', dbUrl: 'postgres://tenant' });
    main.tenantModule.findMany.mockResolvedValue([{ moduleKey: 'FINANCE' }]);
    tenantDb.user.findUnique.mockResolvedValue({
        id: 'user-one',
        name: 'User',
        role: 'FINANCE',
        isSuperAdmin: false,
        isActive: true,
        authMode: 'CENTRAL',
        centralAccountId: 'account-one',
        centralAuthVersion: 5,
    });
    tenantDb.userRole.findMany.mockResolvedValue([]);
    tenantDb.rolePermission.findMany.mockResolvedValue([
        { resource: '/finance' },
    ]);
    tenantDb.helpConversation.create.mockResolvedValue({ id: 'fresh' });
    main.telegramAssistantLink.findUnique.mockResolvedValue({
        id: 'link-one',
        botKey: 'assistant-v1',
        telegramUserId: '123',
        telegramChatId: '123',
        globalAccountId: 'account-one',
        status: 'ACTIVE',
        selectedTenantId: 'tenant-one',
        selectedMembershipId: 'membership-one',
        selectedTenantUserId: 'user-one',
        activeConversationId: null,
        selectionVersion: 2,
        globalAccount: { status: 'ACTIVE', revocationVersion: 3 },
    });
    main.tenantMembership.findFirst.mockResolvedValue({
        id: 'membership-one',
        tenantId: 'tenant-one',
        tenantUserId: 'user-one',
        membershipVersion: 4,
        tenant: { id: 'tenant-one', name: 'Tenant One', dbUrl: 'postgres://tenant' },
        globalAccount: { status: 'ACTIVE', revocationVersion: 3 },
    });
});

describe('durable authority boundary', () => {
    it('rejects a durable conversation owned by another user', async () => {
        main.assistantDurableBinding.findFirst.mockResolvedValue(null);
        main.assistantDurableBinding.findUnique.mockResolvedValue({
            tenantId: 'tenant-one',
            userId: 'other-user',
            channel: 'web',
            accessScopeHash: 'old',
            workContextKey: 'general:/',
        });
        await expect(
            verifyDurableAuthority({
                tenantId: 'tenant-one',
                userId: 'user-one',
                channel: 'web',
                publicConversationId: 'foreign',
                workContext: { pathname: '/' },
            }),
        ).rejects.toMatchObject({ code: 'CONTEXT_MISMATCH', status: 403 });
        expect(tenantDb.helpConversation.create).not.toHaveBeenCalled();
    });

    it('starts fresh instead of importing a legacy conversation id', async () => {
        main.assistantDurableBinding.findFirst.mockResolvedValue(null);
        main.assistantDurableBinding.findUnique.mockResolvedValue(null);
        const result = await verifyDurableAuthority({
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'web',
            publicConversationId: 'legacy-conversation',
            workContext: { pathname: '/finance' },
        });
        expect(result.authority.publicConversationId).toBe('fresh');
        expect(tenantDb.helpConversation.findFirst).not.toHaveBeenCalled();
    });

    it('revalidates Telegram GlobalAccount/membership/local CENTRAL binding', async () => {
        const result = await verifyDurableAuthority({
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'telegram',
            telegramAuthority: {
                botKey: 'assistant-v1',
                telegramUserId: '123',
                telegramChatId: '123',
                linkId: 'link-one',
                globalAccountId: 'account-one',
                membershipId: 'membership-one',
                tenantId: 'tenant-one',
                tenantUserId: 'user-one',
                selectionVersion: 2,
                globalRevocationVersion: 3,
                membershipVersion: 4,
                centralAuthVersion: 5,
            },
            workContext: { pathname: '/warehouse/inventory' },
        });
        expect(result.authority.telegramAuthority).toEqual({
            botKey: 'assistant-v1',
            telegramUserId: '123',
            telegramChatId: '123',
            linkId: 'link-one',
            globalAccountId: 'account-one',
            membershipId: 'membership-one',
            tenantId: 'tenant-one',
            tenantUserId: 'user-one',
            selectionVersion: 2,
            globalRevocationVersion: 3,
            membershipVersion: 4,
            centralAuthVersion: 5,
        });

        tenantDb.helpConversation.findFirst.mockResolvedValueOnce({
            id: result.authority.publicConversationId,
        });
        await expect(
            withBoundAuthority(result.authority, async () => 'tool-ran'),
        ).resolves.toBe('tool-ran');

        // Simulate a same-tenant reselection after admission but before the
        // tool hook. Exact selection epoch verification must still deny it.
        main.telegramAssistantLink.findUnique.mockResolvedValueOnce({
            id: 'link-one',
            botKey: 'assistant-v1',
            telegramUserId: '123',
            telegramChatId: '123',
            globalAccountId: 'account-one',
            status: 'ACTIVE',
            selectedTenantId: 'tenant-one',
            selectedMembershipId: 'membership-one',
            selectedTenantUserId: 'user-one',
            activeConversationId: null,
            selectionVersion: 3,
            globalAccount: { status: 'ACTIVE', revocationVersion: 3 },
        });
        await expect(
            withBoundAuthority(result.authority, async () => 'must-not-run'),
        ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it.each([
        {
            label: 'GlobalAccount revocation epoch',
            mutate: () =>
                main.tenantMembership.findFirst.mockResolvedValueOnce({
                    id: 'membership-one',
                    tenantId: 'tenant-one',
                    tenantUserId: 'user-one',
                    membershipVersion: 4,
                    tenant: {
                        id: 'tenant-one',
                        name: 'Tenant One',
                        dbUrl: 'postgres://tenant',
                    },
                    globalAccount: {
                        status: 'ACTIVE',
                        revocationVersion: 4,
                    },
                }),
        },
        {
            label: 'membership epoch',
            mutate: () =>
                main.tenantMembership.findFirst.mockResolvedValueOnce({
                    id: 'membership-one',
                    tenantId: 'tenant-one',
                    tenantUserId: 'user-one',
                    membershipVersion: 5,
                    tenant: {
                        id: 'tenant-one',
                        name: 'Tenant One',
                        dbUrl: 'postgres://tenant',
                    },
                    globalAccount: {
                        status: 'ACTIVE',
                        revocationVersion: 3,
                    },
                }),
        },
        {
            label: 'local CENTRAL actor epoch',
            mutate: () =>
                tenantDb.user.findUnique.mockResolvedValueOnce({
                    id: 'user-one',
                    name: 'User',
                    role: 'FINANCE',
                    isSuperAdmin: false,
                    isActive: true,
                    authMode: 'CENTRAL',
                    centralAccountId: 'account-one',
                    centralAuthVersion: 6,
                }),
        },
    ])('denies the old authority at a tool boundary after $label changes', async ({ mutate }) => {
        const verified = await verifyDurableAuthority({
            tenantId: 'tenant-one',
            userId: 'user-one',
            channel: 'telegram',
            telegramAuthority: {
                botKey: 'assistant-v1',
                telegramUserId: '123',
                telegramChatId: '123',
                linkId: 'link-one',
                globalAccountId: 'account-one',
                membershipId: 'membership-one',
                tenantId: 'tenant-one',
                tenantUserId: 'user-one',
                selectionVersion: 2,
                globalRevocationVersion: 3,
                membershipVersion: 4,
                centralAuthVersion: 5,
            },
            workContext: { pathname: '/warehouse/inventory' },
        });
        mutate();
        await expect(
            withBoundAuthority(verified.authority, async () => 'must-not-run'),
        ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });

    it('fails closed when permission revalidation finds an inactive user', async () => {
        tenantDb.user.findUnique.mockResolvedValue(null);
        await expect(
            verifyDurableAuthority({
                tenantId: 'tenant-one',
                userId: 'user-one',
                channel: 'web',
                workContext: { pathname: '/' },
            }),
        ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    });
});
