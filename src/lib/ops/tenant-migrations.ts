export interface TenantMigrationRegistry {
    tenant: {
        findMany(args: {
            where: { status: 'ACTIVE' };
            select: { dbUrl: true };
        }): Promise<Array<{ dbUrl: string | null }>>;
    };
    $disconnect(): Promise<void>;
}

export type MigrationCommandFailure =
    | 'MIGRATION_FAILED'
    | 'MIGRATION_LAUNCH_FAILED'
    | 'MIGRATION_INTERRUPTED';

// Only this allowlisted category crosses the command/core boundary, never output
// or the original exception (which can contain connection strings).
export class MigrationCommandError extends Error {
    constructor(readonly category: MigrationCommandFailure) {
        super(category);
    }
}

export type TenantMigrationFailureCategory =
    | MigrationCommandFailure
    | 'REGISTRY_INIT_FAILED'
    | 'REGISTRY_QUERY_FAILED'
    | 'MISSING_DATABASE_URL'
    | 'INVALID_DATABASE_URL'
    | 'REGISTRY_DISCONNECT_FAILED';

export interface TenantMigrationResult {
    selected: number;
    attempted: number;
    migrated: number;
    failures: Array<{
        category: TenantMigrationFailureCategory;
        // A run-local ordinal, not a tenant identifier or URL.
        tenantNumber?: number;
    }>;
}

export interface TenantMigrationDependencies {
    createRegistry(): TenantMigrationRegistry;
    migrate(databaseUrl: string): Promise<void>;
}

function validateDatabaseUrl(value: unknown):
    | 'MISSING_DATABASE_URL'
    | 'INVALID_DATABASE_URL'
    | undefined {
    if (value == null || (typeof value === 'string' && !value.trim())) {
        return 'MISSING_DATABASE_URL';
    }
    if (
        typeof value !== 'string' ||
        value !== value.trim() ||
        Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        /%(?![\da-f]{2})/i.test(value)
    ) {
        return 'INVALID_DATABASE_URL';
    }
    try {
        const url = new URL(value);
        if (
            !['postgresql:', 'postgres:'].includes(url.protocol) ||
            !url.hostname ||
            url.pathname.length <= 1 ||
            url.hash ||
            (url.port && (!/^\d+$/.test(url.port) || Number(url.port) > 65535 || Number(url.port) < 1))
        ) {
            return 'INVALID_DATABASE_URL';
        }
    } catch {
        return 'INVALID_DATABASE_URL';
    }
}

/** Run sequentially; failures never prevent the remaining ACTIVE tenants from
 * being attempted. The registry is owned here and always disconnected.
 * Dependencies are explicit so importing this module cannot open a connection.
 */
export async function migrateAllTenants(
    dependencies: TenantMigrationDependencies,
): Promise<TenantMigrationResult> {
    const result: TenantMigrationResult = {
        selected: 0,
        attempted: 0,
        migrated: 0,
        failures: [],
    };
    let registry: TenantMigrationRegistry;
    try {
        registry = dependencies.createRegistry();
    } catch {
        result.failures.push({ category: 'REGISTRY_INIT_FAILED' });
        return result;
    }

    try {
        const tenants = await registry.tenant.findMany({
            where: { status: 'ACTIVE' },
            select: { dbUrl: true },
        });
        result.selected = tenants.length;
        for (const [index, tenant] of tenants.entries()) {
            const tenantNumber = index + 1;
            const invalid = validateDatabaseUrl(tenant.dbUrl);
            if (invalid) {
                result.failures.push({ category: invalid, tenantNumber });
                continue;
            }
            try {
                result.attempted++;
                // Validation does not normalize/rebuild the URL. Pass it opaquely.
                await dependencies.migrate(tenant.dbUrl as string);
                result.migrated++;
            } catch (error) {
                result.failures.push({
                    category: error instanceof MigrationCommandError
                        ? error.category
                        : 'MIGRATION_FAILED',
                    tenantNumber,
                });
            }
        }
    } catch {
        result.failures.push({ category: 'REGISTRY_QUERY_FAILED' });
    } finally {
        try {
            await registry.$disconnect();
        } catch {
            result.failures.push({ category: 'REGISTRY_DISCONNECT_FAILED' });
        }
    }
    return result;
}
