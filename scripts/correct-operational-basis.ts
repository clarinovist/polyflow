import { PrismaClient } from '@prisma/client';
import {
    correctOperationalBasis,
    type OperationalBasisCorrectionRequest,
} from '../src/lib/ops/operational-basis-correction';

const USAGE = `Usage:
  correct-operational-basis --tenant=<subdomain> --database=<db> --sku=<sku>
    --movement-id=<uuid> --amount=<rupiah> --posting-date=YYYY-MM-DD
    --actor-id=<finance-user-id> --reason="<min 12 chars>"
    [--execute --yes --fingerprint=<sha256> --backup=<reference>]

Preview is read-only. Execute requires the exact preview fingerprint and a
verified backup reference. No quantity, average cost or historical movement is
changed; only one SKU-linked correction journal is posted in the source
adjustment's own accounts. The amount must equal the 2-decimal gap shown by the
preview; debit and credit accounts are derived from the source journal.`;

const FLAGS = new Set(['--execute', '--yes']);
const OPTIONS = new Set([
    'tenant',
    'database',
    'sku',
    'movement-id',
    'amount',
    'posting-date',
    'actor-id',
    'reason',
    'fingerprint',
    'backup',
]);

export function parseOperationalBasisCorrectionArgs(args: string[]) {
    const value = (key: string) => {
        const matches = args.filter((arg) => arg.startsWith(`--${key}=`));
        if (matches.length !== 1 || !matches[0].slice(key.length + 3))
            throw new Error(`Exactly one --${key}=value required.`);
        return matches[0].slice(key.length + 3);
    };
    const execute = args.includes('--execute');
    if (execute && !args.includes('--yes'))
        throw new Error('--execute requires --yes.');
    for (const arg of args) {
        if (FLAGS.has(arg)) continue;
        if (!arg.startsWith('--')) throw new Error(`Unknown argument ${arg}.`);
        const [key, ...rest] = arg.slice(2).split('=');
        if (!OPTIONS.has(key) || rest.length === 0)
            throw new Error(`Unknown argument --${key}.`);
    }
    if (
        !execute &&
        args.some(
            (arg) =>
                arg.startsWith('--fingerprint=') || arg.startsWith('--backup='),
        )
    )
        throw new Error('--fingerprint/--backup only with --execute.');

    const request: OperationalBasisCorrectionRequest = {
        database: value('database'),
        skuCode: value('sku'),
        movementId: value('movement-id'),
        amount: value('amount'),
        postingDate: value('posting-date'),
        actorId: value('actor-id'),
        reason: value('reason'),
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
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
        console.log(USAGE);
        return;
    }
    const options = parseOperationalBasisCorrectionArgs(args);
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
        const result = await correctOperationalBasis(
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
        // Operational error only; never print connection details or raw rows.
        console.error(
            error instanceof Error && error.constructor === Error
                ? error.message
                : 'Basis correction failed; inspect private evidence.',
        );
        process.exitCode = 1;
    });
