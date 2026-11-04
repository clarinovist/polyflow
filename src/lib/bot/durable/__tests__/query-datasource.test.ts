import { describe, expect, it } from 'vitest';
import {
    assertQueryDatasourceIsReadOnly,
    parseTenantQueryDatasources,
    resolveTenantQueryDatasource,
    createTenantQueryDatasourceResolver,
} from '../query-datasource';

const url = 'postgresql://assistant_query:secret@db:5432/tenant_one';

describe('assistant query datasource map', () => {
    it('is empty by default so brokered tools fail closed', async () => {
        expect(parseTenantQueryDatasources(undefined).size).toBe(0);
        expect(parseTenantQueryDatasources('').size).toBe(0);
        await expect(
            createTenantQueryDatasourceResolver('')('tenant-one'),
        ).resolves.toBeUndefined();
    });

    it('resolves only the exact tenant id', async () => {
        const datasources = parseTenantQueryDatasources(
            JSON.stringify({ 'tenant-one': url }),
        );
        expect(resolveTenantQueryDatasource(datasources, 'tenant-one')).toBe(
            url,
        );
        expect(
            resolveTenantQueryDatasource(datasources, 'tenant-two'),
        ).toBeUndefined();
        await expect(
            createTenantQueryDatasourceResolver(
                JSON.stringify({ 'tenant-one': url }),
                async () => undefined,
            )('tenant-one'),
        ).resolves.toBe(url);
    });

    it.each([
        ['not json', 'ASSISTANT_QUERY_DATASOURCE_INVALID'],
        ['[]', 'ASSISTANT_QUERY_DATASOURCE_INVALID'],
        ['null', 'ASSISTANT_QUERY_DATASOURCE_INVALID'],
        [
            JSON.stringify({ 'bad tenant': url }),
            'ASSISTANT_QUERY_DATASOURCE_INVALID_TENANT',
        ],
        [
            JSON.stringify({ tenant: 'mysql://db/tenant' }),
            'ASSISTANT_QUERY_DATASOURCE_INVALID_URL',
        ],
        [
            JSON.stringify({ tenant: 'postgresql://db' }),
            'ASSISTANT_QUERY_DATASOURCE_INVALID_URL',
        ],
        [
            JSON.stringify({ tenant: 42 }),
            'ASSISTANT_QUERY_DATASOURCE_INVALID_URL',
        ],
    ])('rejects malformed mapping %#', (raw, message) => {
        expect(() => parseTenantQueryDatasources(raw)).toThrow(message);
    });

    it('rejects a mapping that points at the writer connection', () => {
        const writer =
            'postgresql://polyflow:writer@db:5432/polyflow?schema=public';
        expect(() =>
            parseTenantQueryDatasources(
                JSON.stringify({
                    'tenant-one':
                        'postgresql://polyflow:other@db:5432/polyflow?schema=public',
                }),
                writer,
            ),
        ).toThrow('ASSISTANT_QUERY_DATASOURCE_MUST_DIFFER_FROM_WRITER');

        expect(
            parseTenantQueryDatasources(
                JSON.stringify({
                    'tenant-one':
                        'postgresql://assistant_query:secret@db:5432/polyflow?schema=public',
                }),
                writer,
            ).get('tenant-one'),
        ).toContain('assistant_query');
    });

    it('rejects a read-only DSN that is the tenant writer connection', () => {
        const tenantWriter =
            'postgresql://polyflow:writer@db:5432/acme_tenant?schema=public';
        expect(() =>
            assertQueryDatasourceIsReadOnly(
                'postgresql://polyflow:other@db:5432/acme_tenant?schema=public',
                tenantWriter,
            ),
        ).toThrow('ASSISTANT_QUERY_DATASOURCE_MUST_DIFFER_FROM_WRITER');
        expect(() =>
            assertQueryDatasourceIsReadOnly(
                'postgresql://assistant_query:secret@db:5432/acme_tenant',
                tenantWriter,
            ),
        ).not.toThrow();
        expect(() =>
            assertQueryDatasourceIsReadOnly('postgresql://x/db', undefined),
        ).not.toThrow();
    });

    it('resolves through the injected writer lookup and fails closed', async () => {
        const raw = JSON.stringify({
            'tenant-one':
                'postgresql://polyflow:secret@db:5432/tenant_one',
        });
        const resolve = createTenantQueryDatasourceResolver(
            raw,
            async () =>
                'postgresql://polyflow:writer@db:5432/tenant_one',
        );
        await expect(resolve('tenant-two')).resolves.toBeUndefined();
        await expect(resolve('tenant-one')).rejects.toThrow(
            'ASSISTANT_QUERY_DATASOURCE_MUST_DIFFER_FROM_WRITER',
        );

        const allow = createTenantQueryDatasourceResolver(
            raw,
            async () => 'postgresql://polyflow:writer@db:5432/polyflow',
        );
        await expect(allow('tenant-one')).resolves.toBe(
            'postgresql://polyflow:secret@db:5432/tenant_one',
        );
    });

    it('rejects an oversized mapping', () => {
        const raw = JSON.stringify(
            Object.fromEntries(
                Array.from({ length: 101 }, (_, index) => [
                    `tenant-${index}`,
                    url,
                ]),
            ),
        );
        expect(() => parseTenantQueryDatasources(raw)).toThrow(
            'ASSISTANT_QUERY_DATASOURCE_TOO_MANY_TENANTS',
        );
    });
});
