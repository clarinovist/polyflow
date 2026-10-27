import { PrismaClient } from '@prisma/client';
import {
    attributeOperationalOpening,
    type OpeningAttributionRequest,
} from '../src/lib/ops/operational-opening-attribution';

export function parseOpeningAttributionArgs(args: string[]) {
    const value = (key: string) => {
        const matches = args.filter((arg) => arg.startsWith(`--${key}=`));
        if (matches.length !== 1 || !matches[0].slice(key.length + 3))
            throw new Error(`Exactly one --${key}=value required.`);
        return matches[0].slice(key.length + 3);
    };
    const execute = args.includes('--execute');
    if (execute && !args.includes('--yes'))
        throw new Error('--execute requires --yes.');
    const request: OpeningAttributionRequest = {
        database: value('database'),
        actorId: value('actor-id'),
        reason: value('reason'),
        targetAccountCode: value('target-account'),
        clearingAccountCode: value('clearing-account'),
        ...(execute
            ? {
                  expectedFingerprint: value('fingerprint'),
                  backupReference: value('backup'),
              }
            : {}),
    };
    return { tenant: value('tenant'), request, execute };
}

async function main() {
    const options = parseOpeningAttributionArgs(process.argv.slice(2));
    const registry = new PrismaClient();
    let tenantDb: PrismaClient | undefined;
    try {
        const tenant = await registry.tenant.findFirst({
            where: { subdomain: options.tenant, status: 'ACTIVE' },
            select: { dbUrl: true },
        });
        if (
            !tenant?.dbUrl ||
            decodeURIComponent(new URL(tenant.dbUrl).pathname.slice(1)) !==
                options.request.database
        )
            throw new Error('Tenant database differs from reviewed target.');
        tenantDb = new PrismaClient({
            datasources: { db: { url: tenant.dbUrl } },
        });
        console.log(
            JSON.stringify(
                await attributeOperationalOpening(
                    tenantDb,
                    options.request,
                    options.execute,
                ),
                null,
                2,
            ),
        );
    } finally {
        await tenantDb?.$disconnect();
        await registry.$disconnect();
    }
}
if (require.main === module)
    main().catch((error: unknown) => {
        // Operational error only; never print Prisma connection details or raw rows.
        console.error(
            error instanceof Error && error.constructor === Error
                ? error.message
                : 'Opening attribution failed; inspect private evidence.',
        );
        process.exitCode = 1;
    });
