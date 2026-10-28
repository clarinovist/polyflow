import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ApplicationError } from '../src/lib/errors/errors';
import {
    applyStaleShellClosure,
    parseStaleShellRequest,
    previewStaleShellClosure,
    saveStaleShellEvidence,
} from '../src/lib/ops/stale-shell-closure';

const USAGE =
    'close-stale-shells --input=/absolute/reviewed.json [--execute --yes]';

export function parseStaleShellArgs(args: string[]) {
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
    const { path, execute } = parseStaleShellArgs(args);
    const input = parseStaleShellRequest(
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
            const applied = await applyStaleShellClosure(db, input, (plan) =>
                saveStaleShellEvidence('/app/backups', tenant.id, plan),
            );
            console.log(JSON.stringify({ phase: 'apply', ...applied }));
        }
        const plan = await previewStaleShellClosure(db, input);
        console.log(
            JSON.stringify({
                phase: 'inspect',
                database: plan.database,
                fingerprint: plan.fingerprint,
                totals: plan.totals,
                frozenShellIds: plan.frozenShellIds,
                unreadableOrderNumbers: plan.unreadableOrderNumbers,
                shells: plan.shells.map((shell) => ({
                    orderNumber: shell.orderNumber,
                    startTime: shell.startTime,
                    plannedEndTime: shell.plannedEndTime,
                    atLastOutput: shell.atLastOutput,
                })),
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
                : 'Stale shell closure failed. Check private evidence; do not assume rollback after a lost response.',
        );
        process.exitCode = 1;
    });
