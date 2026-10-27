import { PrismaClient } from '@prisma/client';
import {
    normalizeAbsorbedScrap,
    scanAbsorbedScrap,
    type AbsorbedScrapRequest,
} from '../src/lib/ops/absorbed-scrap-normalization';

type Options =
    | { tenant: string; mode: 'scan'; database: string }
    | {
          tenant: string;
          mode: 'order';
          execute: boolean;
          request: AbsorbedScrapRequest;
      };

export function parseAbsorbedScrapArgs(args: string[]): Options {
    const value = (key: string) => {
        const matches = args.filter((arg) => arg.startsWith(`--${key}=`));
        if (matches.length !== 1 || !matches[0].slice(key.length + 3))
            throw new Error(`Exactly one --${key}=value required.`);
        return matches[0].slice(key.length + 3);
    };
    const tenant = value('tenant'),
        database = value('database');
    if (args.includes('--scan')) {
        // Scan is read-only by construction: refuse any order/apply argument with it.
        if (
            args.some(
                (arg) =>
                    arg !== '--scan' &&
                    !arg.startsWith('--tenant=') &&
                    !arg.startsWith('--database='),
            )
        ) {
            throw new Error('--scan takes only --tenant and --database.');
        }
        return { tenant, mode: 'scan', database };
    }
    const execute = args.includes('--execute');
    if (execute && !args.includes('--yes'))
        throw new Error('--execute requires --yes.');
    const request: AbsorbedScrapRequest = {
        database,
        orderId: value('order-id'),
        orderNumber: value('order-number'),
        actorId: value('actor-id'),
        reason: value('reason'),
        ...(execute
            ? {
                  expectedFingerprint: value('fingerprint'),
                  backupReference: value('backup'),
              }
            : {}),
    };
    return { tenant, mode: 'order', execute, request };
}

async function main() {
    const options = parseAbsorbedScrapArgs(process.argv.slice(2));
    const database =
        options.mode === 'scan' ? options.database : options.request.database;
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
                database
        )
            throw new Error('Tenant database differs from reviewed target.');
        tenantDb = new PrismaClient({
            datasources: { db: { url: tenant.dbUrl } },
        });
        const result =
            options.mode === 'scan'
                ? await scanAbsorbedScrap(tenantDb, { database })
                : await normalizeAbsorbedScrap(
                      tenantDb,
                      options.request,
                      options.execute,
                  );
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await tenantDb?.$disconnect();
        await registry.$disconnect();
    }
}
if (require.main === module)
    main().catch((error: unknown) => {
        // Operational error only; never print Prisma connection details or raw rows.
        const known =
            error instanceof Error &&
            ['Error', 'AbsorbedScrapRejection'].includes(
                error.constructor.name,
            );
        console.error(
            known
                ? (error as Error).message
                : 'Absorbed scrap normalization failed; inspect private evidence.',
        );
        process.exitCode = 1;
    });
