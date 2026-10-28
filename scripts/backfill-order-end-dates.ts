import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ApplicationError } from '../src/lib/errors/errors';
import {
    applyOrderEndDates,
    parseEndDateBackfillRequest,
    previewOrderEndDates,
    saveEndDateEvidence,
} from '../src/lib/ops/order-end-date-backfill';

const USAGE =
    'backfill-order-end-dates --input=/absolute/reviewed.json [--execute --yes]';

export function parseEndDateBackfillArgs(args: string[]) {
    const inputs = args.filter((arg) => arg.startsWith('--input='));
    const allowed = (arg: string) =>
        arg.startsWith('--input=') || arg === '--execute' || arg === '--yes';
    if (inputs.length !== 1 || !args.every(allowed))
        throw new Error('Use one --input file and optional --execute --yes.');
    const path = inputs[0].slice('--input='.length);
    const execute = args.includes('--execute');
    if (!isAbsolute(path) || execute !== args.includes('--yes'))
        throw new Error(
            'Absolute input file and explicit --execute --yes required.',
        );
    return { path, execute };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
        console.log(USAGE);
        return;
    }
    const { path, execute } = parseEndDateBackfillArgs(args);
    const input = parseEndDateBackfillRequest(
        JSON.parse(await readFile(path, 'utf8')),
        execute,
    );
    const registry = new PrismaClient();
    let db: PrismaClient | undefined;
    try {
        const tenant = await registry.tenant.findFirst({
            where: { subdomain: input.tenant, status: 'ACTIVE' },
            select: { id: true, dbUrl: true },
        });
        if (
            !tenant?.dbUrl ||
            decodeURIComponent(new URL(tenant.dbUrl).pathname.slice(1)) !==
                input.database
        )
            throw new Error('Reviewed tenant/database differs.');
        db = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });
        if (execute) {
            const applied = await applyOrderEndDates(db, input, (plan) =>
                saveEndDateEvidence('/app/backups', tenant.id, plan),
            );
            console.log(JSON.stringify({ phase: 'apply', ...applied }));
            return;
        }
        const plan = await previewOrderEndDates(db, input);
        console.log(
            JSON.stringify({
                phase: 'inspect',
                database: plan.database,
                fingerprint: plan.fingerprint,
                orders: plan.orders.length,
                fallback: plan.orders.filter(
                    (order) => order.source === 'FALLBACK',
                ).length,
                months: plan.months,
                monthMoves: plan.monthMoves,
            }),
        );
    } finally {
        await db?.$disconnect();
        await registry.$disconnect();
    }
}

if (require.main === module)
    main().catch((error) => {
        console.error(
            error instanceof ApplicationError
                ? error.message
                : 'Order end-date backfill failed. Check private evidence; do not assume rollback after a lost response.',
        );
        process.exitCode = 1;
    });
