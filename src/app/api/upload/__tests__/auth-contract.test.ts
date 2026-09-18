import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('next/server', () => ({ NextResponse: Response }));

const mocks = vi.hoisted(() => ({
    auth: vi.fn(),
    resolveTenantContext: vi.fn(),
    mainUser: vi.fn(),
    tenantUser: vi.fn(),
    upload: vi.fn(),
    prefix: vi.fn(),
    proofKey: vi.fn(),
    warehouseKey: vi.fn(),
    redirect: vi.fn((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); }),
}));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'fixture.example.test' }) }));
vi.mock('@/lib/core/prisma', () => ({
    prisma: {
        user: { findUnique: mocks.mainUser },
        tenant: { findUnique: async () => ({ dbUrl: 'mock-only' }) },
    },
    getMainPrisma: () => ({ user: { findUnique: mocks.mainUser } }),
    getTenantDb: () => ({ user: { findUnique: mocks.tenantUser } }),
    tenantIdContext: { getStore: () => undefined },
}));
vi.mock('@/lib/core/tenant', () => ({
    resolveTenantContext: mocks.resolveTenantContext,
    extractSubdomain: () => 'fixture',
}));
vi.mock('@/lib/storage/r2', () => ({
    getTenantPrefix: mocks.prefix,
    buildRemittanceProofKey: mocks.proofKey,
    buildWarehouseAttachmentKey: mocks.warehouseKey,
    uploadToR2: mocks.upload,
}));

// Exercise real auth + module guards: only session/DB/resolver/storage are mocked.
import { POST as salesPost } from '../remittance-proof/route';
import { POST as purchasePost } from '../purchase-remittance-proof/route';
import { POST as warehousePost } from '../warehouse-attachment/route';

const routes = [
    { name: 'sales', post: salesPost, module: 'FINANCE', roles: ['ADMIN', 'SALES', 'MARKETING'], deniedRole: 'WAREHOUSE' },
    { name: 'purchase', post: purchasePost, module: 'PURCHASING', roles: ['ADMIN', 'PROCUREMENT', 'WAREHOUSE'], deniedRole: 'SALES' },
    { name: 'warehouse', post: warehousePost, module: 'INVENTORY', roles: ['ADMIN', 'SALES', 'MARKETING', 'WAREHOUSE', 'PROCUREMENT', 'FINANCE', 'PRODUCTION', 'PLANNING', 'HRD', 'OPERATOR', ''], deniedRole: null },
];

function makeRequest() {
    const data = new FormData();
    data.append('file', new File(['proof'], 'proof.jpg', { type: 'image/jpeg' }));
    data.append('deliveryOrderId', 'do-1');
    data.append('checkpoint', 'LOAD');
    const formData = vi.fn(async () => data);
    const headers = new Headers({ 'x-tenant-subdomain': 'fixture' });
    return { request: { headers, formData } as unknown as NextRequest, formData };
}

for (const route of routes) {
    describe(`${route.name} upload auth contract`, () => {
        beforeEach(() => {
            vi.clearAllMocks();
            mocks.auth.mockResolvedValue({ user: { id: 'tenant-user', role: route.roles[0] } });
            mocks.tenantUser.mockResolvedValue({ id: 'tenant-user' });
            mocks.mainUser.mockResolvedValue({ id: 'tenant-user' });
            mocks.resolveTenantContext.mockResolvedValue({
                type: 'RESOLVED', tenantDb: { user: { findUnique: mocks.tenantUser } },
                activeModules: [route.module],
            });
            mocks.prefix.mockResolvedValue('fixture');
            mocks.proofKey.mockReturnValue('fixture/proof.jpg');
            mocks.warehouseKey.mockReturnValue('fixture/proof.jpg');
            mocks.upload.mockResolvedValue('/api/images/fixture/proof.jpg');
        });
        afterEach(() => vi.restoreAllMocks());

        function expectNoUpload(formData: ReturnType<typeof vi.fn>) {
            expect(formData).not.toHaveBeenCalled();
            expect(mocks.prefix).not.toHaveBeenCalled();
            expect(mocks.proofKey).not.toHaveBeenCalled();
            expect(mocks.warehouseKey).not.toHaveBeenCalled();
            expect(mocks.upload).not.toHaveBeenCalled();
        }

        it.each([null, { user: {} }])('401 for missing session/id %j, no body or R2', async (session) => {
            mocks.auth.mockResolvedValue(session);
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
            expectNoUpload(formData);
            expect(mocks.redirect).not.toHaveBeenCalled();
        });

        it('401 for stale tenant user, never validates against main DB', async () => {
            mocks.tenantUser.mockResolvedValue(null);
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
            expect(mocks.mainUser).not.toHaveBeenCalled();
            expect(mocks.redirect).not.toHaveBeenCalled();
            expectNoUpload(formData);
        });

        it('401 takes precedence over missing module when session is missing', async () => {
            mocks.auth.mockResolvedValue(null);
            mocks.resolveTenantContext.mockResolvedValue({ type: 'RESOLVED', activeModules: [] });
            const { request, formData } = makeRequest();
            expect((await route.post(request)).status).toBe(401);
            expectNoUpload(formData);
        });

        if (route.deniedRole) {
            it('403 for role denial, no body or R2', async () => {
                mocks.auth.mockResolvedValue({ user: { id: 'tenant-user', role: route.deniedRole } });
                const { request, formData } = makeRequest();
                const response = await route.post(request);
                expect(response.status).toBe(403);
                expect(await response.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
                expectNoUpload(formData);
            });
        }

        it('403 for module denial even for ADMIN, no body or R2', async () => {
            mocks.resolveTenantContext.mockResolvedValue({
                type: 'RESOLVED', tenantDb: { user: { findUnique: mocks.tenantUser } }, activeModules: [],
            });
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(403);
            expect(await response.json()).toMatchObject({ error: 'MODULE_NOT_ENTITLED', moduleKey: route.module });
            expectNoUpload(formData);
        });

        it.each([{ activeModules: [] }, { activeModules: [route.module] }])('403 when auth resolves with modules $activeModules but module lookup returns NOT_FOUND, no body/R2', async ({ activeModules }) => {
            // Registry failures are also returned as NOT_FOUND by the resolver.
            // Route Handlers must not rely on React.cache to deduplicate these calls.
            mocks.resolveTenantContext
                .mockResolvedValueOnce({ type: 'RESOLVED', tenantDb: { user: { findUnique: mocks.tenantUser } }, activeModules })
                .mockResolvedValueOnce({ type: 'NOT_FOUND', subdomain: 'fixture' });
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect.soft(response.status).toBe(403);
            expect.soft(await response.json()).toMatchObject({ error: 'MODULE_NOT_ENTITLED', moduleKey: route.module });
            expect(mocks.resolveTenantContext).toHaveBeenCalledTimes(2);
            expect(mocks.resolveTenantContext).toHaveBeenNthCalledWith(1, request.headers);
            expect(mocks.resolveTenantContext).toHaveBeenNthCalledWith(2, request.headers);
            expect(mocks.tenantUser).toHaveBeenCalledOnce();
            expect(mocks.mainUser).not.toHaveBeenCalled();
            expectNoUpload(formData);
        });

        it('module resolver errors remain fail-closed at 403 before body/R2', async () => {
            mocks.resolveTenantContext
                .mockResolvedValueOnce({ type: 'RESOLVED', tenantDb: { user: { findUnique: mocks.tenantUser } }, activeModules: [route.module] })
                .mockRejectedValueOnce(new Error('Entitlement unavailable'));
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(403);
            expect(await response.json()).toMatchObject({ error: 'MODULE_NOT_ENTITLED', moduleKey: route.module });
            expectNoUpload(formData);
        });

        it('403 for unknown tenant without main DB fallback', async () => {
            mocks.resolveTenantContext.mockResolvedValue({ type: 'NOT_FOUND', subdomain: 'fixture' });
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(403);
            expect(await response.json()).toEqual({ error: 'Forbidden', code: 'TENANT_NOT_FOUND' });
            expect(mocks.mainUser).not.toHaveBeenCalled();
            expectNoUpload(formData);
        });

        it('401 for stale user takes precedence over failed module resolution', async () => {
            mocks.tenantUser.mockResolvedValue(null);
            mocks.resolveTenantContext.mockResolvedValueOnce({
                type: 'RESOLVED', tenantDb: { user: { findUnique: mocks.tenantUser } }, activeModules: [],
            }).mockResolvedValue({ type: 'NOT_FOUND', subdomain: 'fixture' });
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(401);
            expect(await response.json()).toEqual({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
            expect(mocks.resolveTenantContext).toHaveBeenCalledOnce();
            expectNoUpload(formData);
        });

        it('preserves successful non-tenant NONE upload using only the main DB', async () => {
            mocks.resolveTenantContext.mockResolvedValue({ type: 'NONE' });
            const { request, formData } = makeRequest();
            request.headers.delete('x-tenant-subdomain');
            const response = await route.post(request);
            expect(response.status).toBe(200);
            expect(mocks.mainUser).toHaveBeenCalledWith({ where: { id: 'tenant-user' }, select: { id: true } });
            expect(mocks.tenantUser).not.toHaveBeenCalled();
            expect(formData).toHaveBeenCalledOnce();
            expect(mocks.upload).toHaveBeenCalledOnce();
        });

        it.each(route.roles)('preserves successful upload for authenticated role %s', async (role) => {
            mocks.auth.mockResolvedValue({ user: { id: 'tenant-user', role } });
            const { request, formData } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({
                success: true, url: '/api/images/fixture/proof.jpg', key: 'fixture/proof.jpg',
                originalName: 'proof.jpg', mimeType: 'image/jpeg', sizeBytes: 5,
            });
            expect(formData).toHaveBeenCalledOnce();
            expect(mocks.upload).toHaveBeenCalledWith('fixture/proof.jpg', Buffer.from('proof'), 'image/jpeg');
            if (route.name !== 'warehouse') {
                expect(mocks.proofKey).toHaveBeenCalledWith('fixture', 'tenant-user', 'proof.jpg');
            }
        });

        it('keeps real R2 errors at 500, not auth denial', async () => {
            const error = new Error('R2 unavailable');
            mocks.upload.mockRejectedValue(error);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { request } = makeRequest();
            const response = await route.post(request);
            expect(response.status).toBe(500);
            expect(await response.json()).toEqual({ error: 'Upload gagal: R2 unavailable' });
            expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
        });
    });
}
