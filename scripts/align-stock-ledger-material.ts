import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { getMainPrisma, tenantIdContext } from '../src/lib/core/prisma';
import { ApplicationError, ValidationError } from '../src/lib/errors/errors';
import {
    applyMaterialAlignment,
    parseMaterialAlignmentRequest,
    previewMaterialAlignment,
    saveLedgerAlignmentBackup,
} from '../src/lib/ops/stock-ledger-material-alignment';

const USAGE = 'align-stock-ledger-material --input=/absolute/reviewed.json [--execute --yes]';

export function parseMaterialAlignmentArgs(args: string[]) {
    const inputs = args.filter(arg => arg.startsWith('--input='));
    const allowed = (arg: string) => arg.startsWith('--input=') || arg === '--execute' || arg === '--yes';
    if (inputs.length !== 1 || !args.every(allowed) || new Set(args).size !== args.length)
        throw new ValidationError('Use one --input file and optional --execute --yes.');
    const path = inputs[0].slice('--input='.length);
    const execute = args.includes('--execute');
    if (!isAbsolute(path) || execute !== args.includes('--yes'))
        throw new ValidationError('Absolute input file and explicit --execute --yes required.');
    return { path, execute };
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
        console.log(USAGE);
        return;
    }
    const { path, execute } = parseMaterialAlignmentArgs(args);
    const input = parseMaterialAlignmentRequest(JSON.parse(await readFile(path, 'utf8')), execute);
    // Share the registry client used by role resolution so finally closes it too.
    const registry = getMainPrisma();
    let db: PrismaClient | undefined;
    try {
        const tenant = await registry.tenant.findFirst({
            where: { subdomain: input.tenant, status: 'ACTIVE' }, select: { id: true, dbUrl: true },
        });
        if (!tenant?.dbUrl || decodeURIComponent(new URL(tenant.dbUrl).pathname.slice(1)) !== input.database)
            throw new ValidationError('Reviewed tenant/database differs.');
        const target = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });
        db = target;
        await tenantIdContext.run(tenant.id, async () => {
            if (execute) {
                const applied = await applyMaterialAlignment(target, input, (preview, fingerprint) =>
                    saveLedgerAlignmentBackup('/app/backups', tenant.id, preview, fingerprint));
                console.log(JSON.stringify({ phase: 'apply', ...applied }));
            }
            // Execute already verified every material pair. Inspection now expects zero;
            // a later clean rerun requires a newly reviewed zero-pair input/fingerprint.
            const preview = await previewMaterialAlignment(target, execute ? { ...input, expectedPairs: 0 } : input);
            console.log(JSON.stringify({
                phase: 'inspect', database: input.database,
                status: preview.candidates.length === 0 ? 'sudah bersih' : 'perlu penyelarasan',
                ...preview,
            }));
        });
    } finally {
        await db?.$disconnect();
        await registry.$disconnect();
    }
}

if (require.main === module)
    main().catch(error => {
        console.error(error instanceof ApplicationError ? error.message :
            'Stock ledger material alignment failed. Check private evidence; do not assume rollback after a lost response.');
        process.exitCode = 1;
    });
