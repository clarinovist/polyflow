#!/usr/bin/env npx tsx
/**
 * One-off: buat akun GR/IR clearing di sebuah tenant DB.
 * Bagian desain AP invoice-based (plan lokal 2026-09-01, docs/plan/ — gitignored):
 * GR mengkredit GR/IR clearing, invoice membaliknya saat difakturkan.
 * Idempotent: upsert by code.
 *
 * Run:
 *   npx tsx scripts/create-grir-account.ts --tenant=<subdomain> --code=<kode> --name="<nama>"
 */

import { AccountCategory, AccountType, PrismaClient } from '@prisma/client';

const tenantArg = process.argv
    .find((a) => a.startsWith('--tenant='))
    ?.split('=')[1];
const codeArg = process.argv.find((a) => a.startsWith('--code='))?.split('=')[1];
const nameArg = process.argv
    .find((a) => a.startsWith('--name='))
    ?.split('=')[1]
    ?.replace(/^"|"$/g, '');

const mainPrisma = new PrismaClient();

async function main() {
    if (!tenantArg || !codeArg || !nameArg) {
        console.error(
            'Usage: npx tsx scripts/create-grir-account.ts --tenant=<subdomain> --code=<kode> --name="<nama>"',
        );
        process.exitCode = 1;
        return;
    }

    const tenant = await mainPrisma.tenant.findUnique({
        where: { subdomain: tenantArg },
        select: { subdomain: true, dbUrl: true },
    });
    if (!tenant?.dbUrl) throw new Error(`Tenant ${tenantArg} tidak ditemukan`);

    const tenantDb = new PrismaClient({
        datasources: { db: { url: tenant.dbUrl } },
    });

    const account = await tenantDb.account.upsert({
        where: { code: codeArg },
        update: {
            name: nameArg,
            type: AccountType.LIABILITY,
            category: AccountCategory.CURRENT_LIABILITY,
            isActive: true,
        },
        create: {
            code: codeArg,
            name: nameArg,
            type: AccountType.LIABILITY,
            category: AccountCategory.CURRENT_LIABILITY,
            isActive: true,
        },
        select: { id: true, code: true, name: true, type: true },
    });

    console.log('✅ Akun GR/IR siap:', JSON.stringify(account));
    await tenantDb.$disconnect();
}

main()
    .catch((error) => {
        console.error('[grir-account] FAILED:', error);
        process.exitCode = 1;
    })
    .finally(() => mainPrisma.$disconnect());
