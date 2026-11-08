import { getMainPrisma, getTenantDb, tenantContext } from '@/lib/core/prisma';

const ASSISTANT_QUERY_DATASOURCE_ENV = 'ASSISTANT_QUERY_DATABASE_URLS';
const ASSISTANT_CONTROL_DATASOURCE_ENV =
    'ASSISTANT_CONTROL_TENANT_DATABASE_URLS';

const MAX_TENANTS = 100;

function datasourceIdentity(value: string): string | undefined {
    try {
        const url = new URL(value);
        return [
            url.protocol,
            url.hostname.toLowerCase(),
            url.port,
            decodeURIComponent(url.username),
            url.pathname,
        ].join('|');
    } catch {
        return undefined;
    }
}

/**
 * Tenant-scoped read-only datasources for brokered assistant queries.
 *
 * The value is a JSON object of `tenantId -> postgres URL` using a dedicated
 * least-privilege role. A tenant without an entry fails closed: brokered tools
 * never fall back to the writer datasource, and a mapping that points at the
 * writer connection (same host/port/database/user) is rejected outright.
 */
export function parseTenantQueryDatasources(
    raw: string | undefined,
    writerDatasource: string | undefined = process.env.DATABASE_URL,
): ReadonlyMap<string, string> {
    if (!raw?.trim()) return new Map();
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('ASSISTANT_QUERY_DATASOURCE_INVALID');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('ASSISTANT_QUERY_DATASOURCE_INVALID');
    }
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length > MAX_TENANTS) {
        throw new Error('ASSISTANT_QUERY_DATASOURCE_TOO_MANY_TENANTS');
    }
    const writerIdentity = writerDatasource
        ? datasourceIdentity(writerDatasource)
        : undefined;
    const datasources = new Map<string, string>();
    for (const [tenantId, value] of entries) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(tenantId)) {
            throw new Error('ASSISTANT_QUERY_DATASOURCE_INVALID_TENANT');
        }
        if (typeof value !== 'string' || !isPostgresUrl(value)) {
            throw new Error('ASSISTANT_QUERY_DATASOURCE_INVALID_URL');
        }
        if (writerIdentity && datasourceIdentity(value) === writerIdentity) {
            throw new Error(
                'ASSISTANT_QUERY_DATASOURCE_MUST_DIFFER_FROM_WRITER',
            );
        }
        datasources.set(tenantId, value);
    }
    return datasources;
}

function isPostgresUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return (
            (url.protocol === 'postgres:' || url.protocol === 'postgresql:') &&
            url.hostname.length > 0 &&
            url.pathname.length > 1
        );
    } catch {
        return false;
    }
}

export function resolveTenantQueryDatasource(
    datasources: ReadonlyMap<string, string>,
    tenantId: string,
): string | undefined {
    return datasources.get(tenantId);
}

/** Route only tenant Prisma reads to the query role; other ALS stores stay. */
export function runWithQueryDatasource<T>(
    datasourceUrl: string,
    operation: () => Promise<T>,
): Promise<T> {
    return tenantContext.run(getTenantDb(datasourceUrl), operation);
}

export type TenantQueryDatasourceResolver = (
    tenantId: string,
) => Promise<string | undefined>;

/** Reject a read-only DSN that is actually the tenant's writer connection. */
export function assertQueryDatasourceIsReadOnly(
    queryUrl: string,
    writerUrl: string | undefined,
): void {
    if (!writerUrl) return;
    const writerIdentity = datasourceIdentity(writerUrl);
    if (writerIdentity && datasourceIdentity(queryUrl) === writerIdentity) {
        throw new Error('ASSISTANT_QUERY_DATASOURCE_MUST_DIFFER_FROM_WRITER');
    }
}

async function tenantWriterDatasource(
    tenantId: string,
): Promise<string | undefined> {
    const tenant = await getMainPrisma().tenant.findFirst({
        where: { id: tenantId },
        select: { dbUrl: true },
    });
    return tenant?.dbUrl ?? undefined;
}

/**
 * Control-plane tenant datasources for the worker. Same fail-closed shape as
 * the query map, but the DSN uses the control role (reads + assistant table
 * writes only) so the worker cannot mutate business data.
 */
export function createTenantControlDatasourceResolver(
    raw: string | undefined = process.env[ASSISTANT_CONTROL_DATASOURCE_ENV],
    resolveWriterDatasource: (
        tenantId: string,
    ) => Promise<string | undefined> = tenantWriterDatasource,
): TenantQueryDatasourceResolver {
    return createTenantQueryDatasourceResolver(raw, resolveWriterDatasource);
}

/** True when the control map is configured; callers must then fail closed. */
export function isTenantControlDatasourceConfigured(
    raw: string | undefined = process.env[ASSISTANT_CONTROL_DATASOURCE_ENV],
): boolean {
    return Boolean(raw?.trim());
}

/** Lazily parsed so a bad value fails at broker startup, not import time. */
export function createTenantQueryDatasourceResolver(
    raw: string | undefined = process.env[ASSISTANT_QUERY_DATASOURCE_ENV],
    resolveWriterDatasource: (
        tenantId: string,
    ) => Promise<string | undefined> = tenantWriterDatasource,
): TenantQueryDatasourceResolver {
    let datasources: ReadonlyMap<string, string> | undefined;
    return async (tenantId) => {
        datasources ??= parseTenantQueryDatasources(raw);
        const url = resolveTenantQueryDatasource(datasources, tenantId);
        if (!url) return undefined;
        // Registry writer DSNs differ per tenant; the env-level guard above
        // only covers the main database.
        assertQueryDatasourceIsReadOnly(
            url,
            await resolveWriterDatasource(tenantId),
        );
        return url;
    };
}
