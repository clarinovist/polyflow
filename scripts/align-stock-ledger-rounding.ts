import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ApplicationError } from '../src/lib/errors/errors';
import {
    applyLedgerAlignment,
    parseLedgerAlignmentRequest,
    previewLedgerAlignment,
    saveLedgerAlignmentBackup,
} from '../src/lib/ops/stock-ledger-rounding-alignment';

const USAGE =
    'align-stock-ledger-rounding --input=/absolute/reviewed.json [--execute --yes]';

export function parseLedgerAlignmentArgs(args: string[]) {
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
    const { path, execute } = parseLedgerAlignmentArgs(args);
    const input = parseLedgerAlignmentRequest(
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
            const applied = await applyLedgerAlignment(
                db,
                input,
                (preview, fingerprint) =>
                    saveLedgerAlignmentBackup(
                        '/app/backups',
                        tenant.id,
                        preview,
                        fingerprint,
                    ),
            );
            console.log(JSON.stringify({ phase: 'apply', ...applied }));
        }
        const preview = await previewLedgerAlignment(db);
        console.log(
            JSON.stringify({
                phase: 'inspect',
                database: input.database,
                status:
                    preview.candidates.length === 0
                        ? 'sudah bersih'
                        : 'perlu penyelarasan',
                fingerprint: preview.fingerprint,
                candidates: preview.candidates,
                unhandledMaterial: preview.unhandledMaterial,
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
                : 'Stock ledger rounding alignment failed. Check private evidence; do not assume rollback after a lost response.',
        );
        process.exitCode = 1;
    });
