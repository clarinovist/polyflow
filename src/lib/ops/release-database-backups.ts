export type ReleaseBackupFailureCategory =
    | 'MISSING_DATABASE_URL'
    | 'INVALID_DATABASE_URL'
    | 'REGISTRY_INIT_FAILED'
    | 'REGISTRY_QUERY_FAILED'
    | 'REGISTRY_DISCONNECT_FAILED'
    | 'BACKUP_FAILED'
    | 'BACKUP_VERIFY_FAILED';

export interface ReleaseBackupRegistry {
    tenant: {
        findMany(args: { where: { status: 'ACTIVE' }; select: { dbUrl: true } }):
            Promise<Array<{ dbUrl: string | null }>>;
    };
    $disconnect(): Promise<void>;
}

export interface ReleaseBackupResult {
    selected: number;
    backedUp: number;
    failures: Array<{ category: ReleaseBackupFailureCategory; databaseNumber?: number }>;
}

export class ReleaseBackupError extends Error {
    constructor(readonly category: 'BACKUP_FAILED' | 'BACKUP_VERIFY_FAILED') { super(category); }
}

export function validateReleaseDatabaseUrl(value: unknown):
    | 'MISSING_DATABASE_URL' | 'INVALID_DATABASE_URL' | undefined {
    if (value == null || (typeof value === 'string' && !value.trim())) return 'MISSING_DATABASE_URL';
    if (typeof value !== 'string' || value !== value.trim() ||
        Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
        /%(?![\da-f]{2})/i.test(value)) return 'INVALID_DATABASE_URL';
    try {
        const url = new URL(value);
        if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname ||
            url.pathname.length <= 1 || url.hash ||
            (url.port && (!/^\d+$/.test(url.port) || Number(url.port) < 1 || Number(url.port) > 65535))) {
            return 'INVALID_DATABASE_URL';
        }
    } catch { return 'INVALID_DATABASE_URL'; }
}

/** Resolve and validate every target before creating any backup. */
export async function backupReleaseDatabases(dependencies: {
    mainDatabaseUrl: unknown;
    createRegistry(): ReleaseBackupRegistry;
    backup(databaseUrl: string, ordinal: number): Promise<void>;
}): Promise<ReleaseBackupResult> {
    const result: ReleaseBackupResult = { selected: 0, backedUp: 0, failures: [] };
    const mainInvalid = validateReleaseDatabaseUrl(dependencies.mainDatabaseUrl);
    if (mainInvalid) {
        result.failures.push({ category: mainInvalid, databaseNumber: 1 });
        return result;
    }
    let registry: ReleaseBackupRegistry;
    try { registry = dependencies.createRegistry(); }
    catch { result.failures.push({ category: 'REGISTRY_INIT_FAILED' }); return result; }
    let tenantUrls: Array<string | null> = [];
    try {
        tenantUrls = (await registry.tenant.findMany({
            where: { status: 'ACTIVE' }, select: { dbUrl: true },
        })).map((tenant) => tenant.dbUrl);
    } catch { result.failures.push({ category: 'REGISTRY_QUERY_FAILED' }); }
    finally {
        try { await registry.$disconnect(); }
        catch { result.failures.push({ category: 'REGISTRY_DISCONNECT_FAILED' }); }
    }
    if (result.failures.length) return result;
    const candidates = [dependencies.mainDatabaseUrl as string, ...tenantUrls];
    for (const [index, url] of candidates.entries()) {
        const invalid = validateReleaseDatabaseUrl(url);
        if (invalid) {
            result.failures.push({ category: invalid, databaseNumber: index + 1 });
            return result;
        }
    }
    const seen = new Set<string>();
    const urls: string[] = [];
    for (const url of candidates as string[]) {
        const identity = new URL(url);
        identity.username = '';
        identity.password = '';
        identity.search = '';
        identity.hash = '';
        const key = identity.toString();
        if (!seen.has(key)) { seen.add(key); urls.push(url); }
    }
    result.selected = urls.length;
    for (const [index, url] of urls.entries()) {
        const databaseNumber = index + 1;
        try {
            await dependencies.backup(url as string, databaseNumber);
            result.backedUp++;
        } catch (error) {
            result.failures.push({
                category: error instanceof ReleaseBackupError ? error.category : 'BACKUP_FAILED',
                databaseNumber,
            });
            return result;
        }
    }
    return result;
}
