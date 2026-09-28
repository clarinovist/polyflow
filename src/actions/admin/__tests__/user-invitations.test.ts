import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
    auth: vi.fn(), target: vi.fn(), list: vi.fn(), tenant: vi.fn(),
    pending: vi.fn(), create: vi.fn(), audit: vi.fn(), isAdmin: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: m.auth }));
vi.mock('@/lib/core/tenant', () => ({ withTenant: (fn: unknown) => fn }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: { user: { findUnique: m.target, findMany: m.list } },
    getTenantIdFromContext: () => 'tenant-a',
    getTenantDbFromContext: () => ({ user: { findUnique: m.target } }),
    getMainPrisma: () => ({ tenant: { findUnique: m.tenant }, tenantInvitation: { findMany: m.pending } }),
}));
vi.mock('@/lib/auth/roles', () => ({ isTenantAdmin: m.isAdmin }));
vi.mock('@/lib/auth/central-oidc-config', () => ({ isCentralSsoConfigured: () => true }));
vi.mock('@/services/auth/tenant-invitation-service', () => ({ createTenantInvitationService: () => ({ createInvitation: m.create }) }));
vi.mock('@/lib/tools/audit', () => ({ logActivity: m.audit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { getUsers, inviteUserToCentralLogin } from '../users';

beforeEach(() => {
    vi.clearAllMocks();
    m.auth.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } });m.isAdmin.mockReturnValue(true);
    m.target.mockImplementation(async ({ where }: { where: { id: string } }) => where.id === 'admin'
        ? { isActive: true } : { id: 'actor', name: 'Recipient', email: 'recipient@example.test', role: 'SALES' });
    m.tenant.mockResolvedValue({ id: 'tenant-a', name: 'Company A', subdomain: 'tenant-a', status: 'ACTIVE' });
    m.create.mockResolvedValue({ invitationId: 'invite-1', token: 'synthetic-invitation-token-long-enough-12345', expiresAt: new Date('2027-01-01') });
    m.audit.mockResolvedValue(undefined);
    m.list.mockResolvedValue([{ id: 'actor', name: 'Recipient', email: 'recipient@example.test', role: 'SALES', roles: [{ role: 'SALES' }], centralAccountId: null }]);
    m.pending.mockResolvedValue([{ id: 'invite-1', tenantUserId: 'actor' }]);
});

describe('authorized invitation UI metadata', () => {
    it('returns authoritative recipient and tenant with the newly issued URL only to admin', async () => {
        const result = await inviteUserToCentralLogin('actor');
        expect(result.success).toBe(true);if (!result.success) return;
        expect(result.data).toMatchObject({
            invitationId: 'invite-1', recipient: { id: 'actor', name: 'Recipient', email: 'recipient@example.test' },
            tenant: { name: 'Company A', origin: expect.stringContaining('tenant-a.') },
            invitationUrl: expect.stringContaining('/login#invite=synthetic-invitation-token'),
        });
        expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', tenantUserId: 'actor', recipientEmail: 'recipient@example.test' }));
        expect(JSON.stringify(m.audit.mock.calls)).not.toContain('synthetic-invitation-token');
    });

    it('keeps the only raw link available even if supplementary audit fails', async () => {
        m.audit.mockRejectedValue(new Error('audit unavailable'));
        expect((await inviteUserToCentralLogin('actor')).success).toBe(true);
    });

    it('lists only pending invitation IDs, never raw tokens', async () => {
        const result = await getUsers();
        expect(result).toMatchObject({ success: true, data: [{ id: 'actor', centralInvitationStatus: 'PENDING', centralInvitationId: 'invite-1' }] });
        expect(m.pending).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ tenantId: 'tenant-a', status: 'PENDING' }),
            select: { id: true, tenantUserId: true },
        }));
        expect(JSON.stringify(result)).not.toMatch(/token|invitationUrl/);
    });

    it('returns no ID when no pending invitation exists', async () => {
        m.pending.mockResolvedValue([]);
        expect(await getUsers()).toMatchObject({ success: true, data: [{ centralInvitationStatus: null, centralInvitationId: null }] });
    });

    it('denies unauthorized metadata and invitation access before service execution', async () => {
        m.isAdmin.mockReturnValue(false);
        expect((await inviteUserToCentralLogin('actor')).success).toBe(false);
        expect((await getUsers()).success).toBe(false);
        expect(m.create).not.toHaveBeenCalled();expect(m.pending).not.toHaveBeenCalled();
    });
});
