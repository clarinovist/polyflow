import { describe, expect, it, vi } from 'vitest';
import { buildTenantOrigin } from '@/lib/auth/tenant-origin';

describe('buildTenantOrigin', () => {
    it('builds an origin only from the trusted tenant registry record', () => {
        vi.stubEnv('NEXT_PUBLIC_ROOT_DOMAIN', 'example.test');
        expect(
            buildTenantOrigin({
                id: 'tenant-a',
                subdomain: 'tenant-a',
                status: 'ACTIVE',
            }),
        ).toBe('https://tenant-a.example.test');
        vi.unstubAllEnvs();
    });

    it('supports the explicit localhost protocol and port used by development', () => {
        expect(
            buildTenantOrigin(
                {
                    id: 'tenant-a',
                    subdomain: 'tenant-a',
                    status: 'ACTIVE',
                },
                { rootDomain: 'localhost', protocol: 'http:', port: '3000' },
            ),
        ).toBe('http://tenant-a.localhost:3000');
    });

    it.each([
        { subdomain: 'admin', status: 'ACTIVE' },
        { subdomain: 'tenant-a.example.test', status: 'ACTIVE' },
        { subdomain: 'tenant-a', status: 'SUSPENDED' },
    ])('rejects an unsafe or inactive registry entry: %j', (tenant) => {
        expect(() =>
            buildTenantOrigin(
                { id: 'tenant-a', ...tenant },
                { rootDomain: 'example.test' },
            ),
        ).toThrow();
    });
});
