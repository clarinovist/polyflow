import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextAuthConfig } from 'next-auth';
import { AuthorizationError, BusinessRuleError } from '@/lib/errors/errors';

const mocks = vi.hoisted(() => ({
    nextAuth: vi.fn((_: NextAuthConfig) => ({
        auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {},
    })),
    headers: vi.fn(), cookies: vi.fn(), getCookie: vi.fn(), setCookie: vi.fn(),
    tenant: vi.fn(), accept: vi.fn(), activate: vi.fn(), resolve: vi.fn(),
}));
vi.mock('next-auth', () => ({ default: mocks.nextAuth }));
vi.mock('@/auth.config', () => ({ authConfig: {} }));
vi.mock('next/headers', () => ({ headers: mocks.headers, cookies: mocks.cookies }));
vi.mock('@/lib/core/tenant', () => ({ extractSubdomain: () => null }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {},
    getMainPrisma: () => ({ tenant: { findUnique: mocks.tenant } }),
    getTenantDb: () => ({}),
}));
vi.mock('@/lib/auth/central-oidc-config', () => ({ buildCentralOidcProvider: () => null }));
vi.mock('@/services/auth/tenant-invitation-service', () => ({
    createTenantInvitationService: () => ({ acceptInvitation: mocks.accept }),
}));
vi.mock('@/services/auth/central-identity-service', () => ({
    CentralIdentityService: class { activateExistingUser = mocks.activate; },
}));
vi.mock('@/services/auth/central-login-service', () => ({ resolveCentralLoginUser: mocks.resolve }));

import '@/auth';
const signIn = mocks.nextAuth.mock.calls[0][0].callbacks!.signIn!;
type Params = Parameters<typeof signIn>[0];
const secret = 'sensitive-cookie-token-never-log-this';
const resolved = {
    id: 'private-local-id', email: 'private@example.test', role: 'SALES', roles: ['SALES'],
    tenantId: 'private-tenant-id', globalAccountId: 'private-global-id',
    membershipId: 'private-membership-id', tokenVersion: 1,
};
function input(): Params {
    return {
        user: { id: 'provider-id', email: 'private@example.test', role: 'WAREHOUSE' },
        account: { provider: 'central-oidc', type: 'oidc', providerAccountId: 'private-subject' },
        profile: { iss: 'https://issuer.example.test', sub: 'private-subject', email: 'private@example.test', email_verified: true },
    };
}
function diagnostic() {
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith('[auth][central-login-denied]', expect.any(String));
    const serialized = vi.mocked(console.warn).mock.calls[0][1] as string;
    expect(serialized).not.toMatch(/private|sensitive|example|password|stack|cause|token/i);
    return JSON.parse(serialized);
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers({ 'x-tenant-subdomain': 'private-tenant' }));
    mocks.cookies.mockResolvedValue({ get: mocks.getCookie, set: mocks.setCookie });
    mocks.getCookie.mockReturnValue({ value: secret });
    mocks.setCookie.mockImplementation(() => undefined);
    mocks.tenant.mockResolvedValue({ id: 'private-tenant-id', dbUrl: 'postgresql://private' });
    mocks.accept.mockResolvedValue({ globalAccountId: 'private-global-id', tenantId: 'private-tenant-id', tenantUserId: 'private-local-id' });
    mocks.activate.mockResolvedValue({});
    mocks.resolve.mockResolvedValue(resolved);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('central signIn callback safe diagnostics', () => {
    it('preserves successful invitation activation and session user assignment without logging', async () => {
        const params = input();
        await expect(signIn(params)).resolves.toBe(true);
        expect(params.user).toMatchObject(resolved);
        expect(mocks.accept).toHaveBeenCalledWith(expect.objectContaining({ token: secret }));
        expect(mocks.activate).toHaveBeenCalledTimes(1);
        expect(mocks.setCookie).toHaveBeenCalledWith(expect.any(String), '', expect.objectContaining({ maxAge: 0 }));
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('preserves already-linked login without invitation or logging', async () => {
        mocks.getCookie.mockReturnValue(undefined);
        await expect(signIn(input())).resolves.toBe(true);
        expect(mocks.accept).not.toHaveBeenCalled();
        expect(mocks.activate).not.toHaveBeenCalled();
        expect(mocks.setCookie).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('leaves non-OIDC login untouched', async () => {
        const params = input(); params.account!.provider = 'credentials';
        await expect(signIn(params)).resolves.toBe(true);
        expect(mocks.headers).not.toHaveBeenCalled();
        expect(console.warn).not.toHaveBeenCalled();
    });

    it('reports missing request/profile context without identifiers', async () => {
        mocks.headers.mockResolvedValue(new Headers());
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'REQUEST_CONTEXT', invitationPresent: null, reason: 'CONTEXT_OR_PROFILE_MISSING' });
    });

    it('handles missing profile without logging the thrown TypeError or stack', async () => {
        const params = input(); params.profile = undefined;
        await expect(signIn(params)).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'REQUEST_CONTEXT', invitationPresent: null, reason: 'UNEXPECTED_ERROR' });
    });

    it('reports cookie read failure without cookie content', async () => {
        mocks.cookies.mockRejectedValue(new Error(secret));
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'INVITATION_COOKIE_READ', invitationPresent: null, reason: 'UNEXPECTED_ERROR' });
    });

    it('reports missing invitation tenant before acceptance', async () => {
        mocks.tenant.mockResolvedValue(null);
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'INVITATION_TENANT_LOOKUP', invitationPresent: true, reason: 'CONTEXT_OR_PROFILE_MISSING' });
        expect(mocks.accept).not.toHaveBeenCalled();
    });

    it('distinguishes recipient mismatch while keeping denial generic and user unmodified', async () => {
        mocks.accept.mockRejectedValue(new BusinessRuleError('Akun pusat tidak sesuai dengan penerima undangan.', { email: 'private@example.test', token: secret }));
        const params = input(); const original = { ...params.user };
        await expect(signIn(params)).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'INVITATION_ACCEPT', invitationPresent: true, reason: 'INVITATION_EMAIL_MISMATCH' });
        expect(params.user).toEqual(original);
        expect(mocks.activate).not.toHaveBeenCalled();
    });

    it('reports activation database conflicts without Prisma query/meta', async () => {
        mocks.activate.mockRejectedValue(Object.assign(new Error(`query ${secret}`), { code: 'P2002', meta: { target: 'private-email' } }));
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'MEMBERSHIP_ACTIVATE', invitationPresent: true, reason: 'DB_UNIQUE_CONFLICT' });
        expect(mocks.resolve).not.toHaveBeenCalled();
    });

    it('reports cookie cleanup failure after activation without masking it as membership denial', async () => {
        mocks.setCookie.mockImplementation(() => { throw new Error(secret); });
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'INVITATION_COOKIE_CLEAR', invitationPresent: true, reason: 'UNEXPECTED_ERROR' });
        expect(mocks.activate).toHaveBeenCalledTimes(1);
    });

    it('distinguishes a missing binding without an invitation', async () => {
        mocks.getCookie.mockReturnValue(undefined);
        mocks.resolve.mockRejectedValue(Object.assign(new AuthorizationError(), { reason: 'ACCOUNT_NOT_FOUND', cause: new Error(secret) }));
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'LOGIN_USER_RESOLVE', invitationPresent: false, reason: 'ACCOUNT_NOT_FOUND' });
    });

    it('reports post-activation issuer rejection distinctly', async () => {
        mocks.resolve.mockRejectedValue(new AuthorizationError('Issuer identitas pusat tidak valid.'));
        await expect(signIn(input())).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'LOGIN_USER_RESOLVE', invitationPresent: true, reason: 'ISSUER_INVALID' });
    });

    it('reports user assignment failure at its own stage', async () => {
        const params = input(); Object.freeze(params.user);
        await expect(signIn(params)).resolves.toBe(false);
        expect(diagnostic()).toEqual({ stage: 'SESSION_USER_ASSIGN', invitationPresent: true, reason: 'UNEXPECTED_ERROR' });
    });

    it('still denies when the diagnostic sink throws', async () => {
        mocks.accept.mockRejectedValue(new Error(secret));
        vi.mocked(console.warn).mockImplementation(() => { throw new Error('sink unavailable'); });
        await expect(signIn(input())).resolves.toBe(false);
    });

    it('keeps concurrent callback stages request-local', async () => {
        let rejectFirst!: (error: Error) => void;
        let reachedAccept!: () => void;
        const reached = new Promise<void>(resolve => { reachedAccept = resolve; });
        mocks.accept.mockImplementationOnce(() => { reachedAccept(); return new Promise((_, reject) => { rejectFirst = reject; }); });
        const first = signIn(input()); await reached;
        mocks.getCookie.mockReturnValue(undefined);
        mocks.resolve.mockRejectedValue(new AuthorizationError('Issuer identitas pusat tidak valid.'));
        await expect(signIn(input())).resolves.toBe(false);
        rejectFirst(new BusinessRuleError('Undangan sudah berakhir.'));
        await expect(first).resolves.toBe(false);
        const logs = vi.mocked(console.warn).mock.calls.map(call => JSON.parse(call[1] as string));
        expect(logs).toEqual([
            { stage: 'LOGIN_USER_RESOLVE', invitationPresent: false, reason: 'ISSUER_INVALID' },
            { stage: 'INVITATION_ACCEPT', invitationPresent: true, reason: 'INVITATION_EXPIRED' },
        ]);
    });
});
