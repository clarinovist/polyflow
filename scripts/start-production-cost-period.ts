import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { ApplicationError } from '../src/lib/errors/errors';
import { previewForwardCostPeriod, startForwardCostPeriod } from '../src/services/production/forward-cost-period-service';
import { availableProductionWip } from '../src/services/accounting/production-wip-provenance';

const schema = z.object({
    tenant: z.string().regex(/^[a-z0-9-]+$/), database: z.string().regex(/^[a-z0-9_]+$/),
    orderId: z.string().uuid(), orderNumber: z.string().min(1).max(80),
    actorId: z.string().min(1).max(100), reason: z.string().trim().min(12).max(1000),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export function parseCostPeriodRequest(value: unknown, execute: boolean) {
    const input = schema.parse(value);
    if (execute && !input.fingerprint) throw new Error('Reviewed fingerprint required.');
    return input;
}
/** A durable host-mounted backup, not an ephemeral container file. Exclusive
 * creation + fsync + readback; no override of destination from untrusted input. */
export async function savePeriodBackup(root: string, tenantId: string, evidence: unknown, fingerprint: string) {
    const folder = join(root, 'production-cost-period');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = join(folder, `${randomUUID()}.json`);
    const body = JSON.stringify({ version: 1, tenantId, fingerprint, evidence });
    await writeFile(file, body, { encoding: 'utf8', mode: 0o600, flag: 'wx', flush: true });
    const digest = createHash('sha256').update(body).digest('hex');
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== digest) throw new Error('Backup verification failed.');
    return `${file}#sha256=${digest}`;
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
        console.log('start-production-cost-period --input=/absolute/reviewed.json [--execute --yes]');
        return;
    }
    const inputs = args.filter(a => a.startsWith('--input='));
    if (inputs.length !== 1 || args.some(a => !a.startsWith('--input=') && !['--execute', '--yes'].includes(a))) throw new Error('Use one --input file and optional --execute --yes.');
    const path = inputs[0].slice(8), execute = args.includes('--execute');
    if (!isAbsolute(path) || (execute !== args.includes('--yes'))) throw new Error('Absolute input file and explicit --execute --yes required.');
    const input = parseCostPeriodRequest(JSON.parse(await readFile(path, 'utf8')), execute);
    const registry = new PrismaClient(); let db: PrismaClient | undefined;
    try {
        const tenant = await registry.tenant.findFirst({ where: { subdomain: input.tenant, status: 'ACTIVE' }, select: { id: true, dbUrl: true } });
        if (!tenant?.dbUrl || decodeURIComponent(new URL(tenant.dbUrl).pathname.slice(1)) !== input.database) throw new Error('Reviewed tenant/database differs.');
        db = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });
        const order = await db.productionOrder.findUnique({ where: { id: input.orderId }, select: { orderNumber: true } });
        if (order?.orderNumber !== input.orderNumber) throw new Error('Reviewed order identity differs.');
        if (execute) {
            const applied = await startForwardCostPeriod(db, { orderId: input.orderId, actorId: input.actorId, reason: input.reason, fingerprint: input.fingerprint! }, {
                ready: () => true,
                save: (evidence, fingerprint) => savePeriodBackup('/app/backups', tenant.id, evidence, fingerprint),
            });
            console.log(JSON.stringify({ phase: 'apply', ...applied }));
        }
        const preview = await previewForwardCostPeriod(db, input.orderId);
        const available = preview.alreadyApplied ? await db.$transaction(async tx => {
            await tx.$executeRaw`SET TRANSACTION READ ONLY`;
            return (await availableProductionWip(tx, input.orderId, { lock: false })).toFixed(2);
        }) : null;
        console.log(JSON.stringify({ phase: 'inspect', orderNumber: input.orderNumber, alreadyApplied: preview.alreadyApplied,
            fingerprint: preview.fingerprint, outputCount: preview.executionIds.length, movementCount: preview.movementIds.length,
            historicalBalances: preview.historicalBalances, availableNewCost: available }));
    } finally { await db?.$disconnect(); await registry.$disconnect(); }
}
if (require.main === module) main().catch(error => {
    console.error(error instanceof ApplicationError ? error.message : 'Cost period operation failed. Check private evidence; do not assume rollback after a lost response.');
    process.exitCode = 1;
});
