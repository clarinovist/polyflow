import { PrismaClient } from '@prisma/client';
import { recoverReturnCredit, type RecoveryRequest } from '../src/lib/ops/return-credit-recovery';

export function parseRecoveryArgs(args: string[]) {
    const option = (key: string) => {
        const values = args.filter(a => a.startsWith(`--${key}=`));
        if (values.length !== 1 || !values[0].slice(key.length + 3)) throw new Error(`Exactly one --${key}=value required.`);
        return values[0].slice(key.length + 3);
    };
    const execute = args.includes('--execute');
    if (execute && !args.includes('--yes')) throw new Error('--execute requires --yes.');
    const kind = option('kind');
    if (kind !== 'REINSTATE' && kind !== 'COMPENSATE') throw new Error('Unsupported recovery kind.');
    const input: RecoveryRequest = {
        creditId: option('credit-id'), kind, postingDate: option('date'),
        actorId: option('actor-id'), reason: option('reason'), evidence: option('evidence'),
        ...(execute ? { expectedFingerprint: option('fingerprint') } : {}),
    };
    return { tenant: option('tenant'), expectedDatabase: option('database'), execute, input };
}

async function main() {
    const options = parseRecoveryArgs(process.argv.slice(2));
    const registry = new PrismaClient();
    let tenantDb: PrismaClient | undefined;
    try {
        const tenant = await registry.tenant.findFirst({
            where: { subdomain: options.tenant, status: 'ACTIVE' }, select: { dbUrl: true },
        });
        if (!tenant?.dbUrl) throw new Error('Active tenant not found.');
        const target = new URL(tenant.dbUrl);
        if (decodeURIComponent(target.pathname.slice(1)) !== options.expectedDatabase) throw new Error('Tenant database differs from the reviewed target.');
        tenantDb = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });
        const result = await recoverReturnCredit(tenantDb, options.input, options.execute);
        console.log(JSON.stringify(result, null, 2));
    } finally {
        await tenantDb?.$disconnect();
        await registry.$disconnect();
    }
}

if (require.main === module) {
    main().catch(() => {
        console.error('Return-credit recovery failed; no success assumed. Inspect private operation evidence before retrying.');
        process.exitCode = 1;
    });
}
