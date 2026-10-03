import { beforeEach, describe, expect, it, vi } from 'vitest';

const main = {
    tenant: { findFirst: vi.fn() },
    tenantModule: { findMany: vi.fn() },
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

import { verifyDurableAuthority } from '../authority';

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
    });
    tenantDb.userRole.findMany.mockResolvedValue([]);
    tenantDb.rolePermission.findMany.mockResolvedValue([
        { resource: '/finance' },
    ]);
    tenantDb.helpConversation.create.mockResolvedValue({ id: 'fresh' });
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
