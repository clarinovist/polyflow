import { PrismaClient } from '@prisma/client';
import { execFile, type ExecFileException } from 'node:child_process';
import {
    migrateAllTenants,
    MigrationCommandError,
    type TenantMigrationRegistry,
} from '../src/lib/ops/tenant-migrations';

export interface TenantMigratorCliDependencies {
    createRegistry(): TenantMigrationRegistry;
    resolvePrismaCli(): string;
    execPath: string;
    cwd(): string;
    env: NodeJS.ProcessEnv;
    execute(
        file: string,
        args: string[],
        options: {
            env: NodeJS.ProcessEnv;
            cwd: string;
            shell: false;
            encoding: 'utf8';
        },
        callback: (error: ExecFileException | null) => void,
    ): void;
    log(message: string): void;
    error(message: string): void;
    setExitCode(code: number): void;
}

const defaultDependencies: TenantMigratorCliDependencies = {
    createRegistry: () => new PrismaClient(),
    resolvePrismaCli: () => require.resolve('prisma/build/index.js'),
    execPath: process.execPath,
    cwd: () => process.cwd(),
    env: process.env,
    execute: (file, args, options, callback) => {
        // Capture output; neither stdout nor stderr is forwarded to logs.
        execFile(file, args, options, callback);
    },
    log: (message) => console.log(message),
    error: (message) => console.error(message),
    setExitCode: (code) => { process.exitCode = code; },
};

export async function runTenantMigratorCli(
    dependencies: TenantMigratorCliDependencies = defaultDependencies,
): Promise<void> {
    try {
        dependencies.log('=== Polyflow Tenant Migrator ===');
        const result = await migrateAllTenants({
            createRegistry: () => dependencies.createRegistry(),
            migrate: (databaseUrl) => new Promise<void>((resolve, reject) => {
                try {
                    dependencies.execute(
                        dependencies.execPath,
                        [dependencies.resolvePrismaCli(), 'migrate', 'deploy'],
                        {
                            cwd: dependencies.cwd(),
                            env: { ...dependencies.env, DATABASE_URL: databaseUrl },
                            shell: false,
                            encoding: 'utf8',
                        },
                        (error) => {
                            if (!error) {
                                resolve();
                            } else {
                                const category = error.killed || error.signal
                                    ? 'MIGRATION_INTERRUPTED'
                                    : typeof error.code === 'string'
                                        ? 'MIGRATION_LAUNCH_FAILED'
                                        : 'MIGRATION_FAILED';
                                reject(new MigrationCommandError(category));
                            }
                        },
                    );
                } catch {
                    // Resolver, synchronous launch and environment failures are
                    // also sanitized and allow the next tenant to be attempted.
                    reject(new MigrationCommandError('MIGRATION_LAUNCH_FAILED'));
                }
            }),
        });
        dependencies.setExitCode(result.failures.length > 0 ? 1 : 0);
        for (const failure of result.failures) {
            const scope = failure.tenantNumber === undefined
                ? 'registry'
                : `tenant #${failure.tenantNumber}`;
            dependencies.error(`[${scope}] ${failure.category}`);
        }
        dependencies.log(
            `Tenant migrations: selected=${result.selected}, attempted=${result.attempted}, ` +
            `migrated=${result.migrated}, failures=${result.failures.length}`,
        );
    } catch {
        dependencies.setExitCode(1);
        dependencies.error('TENANT_MIGRATOR_FAILED');
    }
}

// Compiled CommonJS remains scripts/migrate-all-tenants.js. Imports are inert.
if (require.main === module) {
    void runTenantMigratorCli();
}
