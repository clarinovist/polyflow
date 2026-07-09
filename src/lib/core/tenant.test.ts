import { afterEach, describe, expect, it, vi } from 'vitest';

import { extractSubdomain, resolveTenantContext } from './tenant';

const { mockPrisma, mockGetTenantDb, mockGetMainPrisma } = vi.hoisted(() => {
    const mockPrismaInstance = {
        tenant: {
            findUnique: vi.fn(),
        }
    };
    return {
        mockPrisma: mockPrismaInstance,
        mockGetTenantDb: vi.fn((url) => ({ isMockTenantDb: true, url } as never)),
        mockGetMainPrisma: vi.fn(() => mockPrismaInstance),
    };
});

vi.mock('@/lib/core/prisma', () => ({
    prisma: mockPrisma,
    getMainPrisma: mockGetMainPrisma,
    getTenantDb: mockGetTenantDb,
    tenantContext: {
        run: vi.fn((_db, cb) => cb()),
        getStore: vi.fn(),
    }
}));

const ORIGINAL_ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

afterEach(() => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = ORIGINAL_ROOT_DOMAIN;
    vi.clearAllMocks();
});

describe('extractSubdomain', () => {
    it('extracts subdomain from localhost host with port', () => {
        expect(extractSubdomain('tenant-a.localhost:3000')).toBe('tenant-a');
    });

    it('extracts subdomain from default production root domain', () => {
        delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
        expect(extractSubdomain('kiyowo.polyflow.uk')).toBe('kiyowo');
    });

    it('extracts subdomain from custom root domain', () => {
        process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'example.com';
        expect(extractSubdomain('tenant1.example.com')).toBe('tenant1');
    });

    it('returns null for root domain without subdomain', () => {
        delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
        expect(extractSubdomain('polyflow.uk')).toBeNull();
    });

    it('returns null for invalid host', () => {
        expect(extractSubdomain('localhost:3000')).toBeNull();
        expect(extractSubdomain('')).toBeNull();
    });
});

describe('resolveTenantContext', () => {
    it('returns NONE if no subdomain is present in headers', async () => {
        const headers = {
            get: vi.fn((key: string) => {
                if (key === 'host') return 'polyflow.uk';
                return null;
            })
        };

        const result = await resolveTenantContext(headers);
        expect(result).toEqual({ type: 'NONE' });
    });

    it('returns NOT_FOUND if subdomain is detected but tenant not found in DB', async () => {
        const headers = {
            get: vi.fn((key: string) => {
                if (key === 'x-tenant-subdomain') return 'invalid-tenant';
                return null;
            })
        };

        mockPrisma.tenant.findUnique.mockResolvedValue(null);

        const result = await resolveTenantContext(headers);
        expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
            where: { subdomain: 'invalid-tenant' }
        });
        expect(result).toEqual({ type: 'NOT_FOUND', subdomain: 'invalid-tenant' });
    });

    it('returns RESOLVED with tenantDb if tenant is found in DB', async () => {
        const headers = {
            get: vi.fn((key: string) => {
                if (key === 'x-tenant-subdomain') return 'valid-tenant';
                return null;
            })
        };

        mockPrisma.tenant.findUnique.mockResolvedValue({
            id: 'tenant-123',
            subdomain: 'valid-tenant',
            dbUrl: 'postgresql://user:***@localhost:5432/tenant_db'
        });

        const result = await resolveTenantContext(headers);
        expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
            where: { subdomain: 'valid-tenant' }
        });
        expect(mockGetTenantDb).toHaveBeenCalledWith('postgresql://user:***@localhost:5432/tenant_db');
        expect(result).toEqual({
            type: 'RESOLVED',
            subdomain: 'valid-tenant',
            tenantId: 'tenant-123',
            tenantDb: { isMockTenantDb: true, url: 'postgresql://user:***@localhost:5432/tenant_db' }
        });
    });
});
