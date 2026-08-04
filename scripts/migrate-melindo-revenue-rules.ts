#!/usr/bin/env tsx
/**
 * Migrate legacy Melindo revenue rules (src constant) into TenantRevenueRule rows.
 *
 * SAFETY:
 * - Dry-run by default. Set APPLY=1 to write.
 * - Requires explicit tenant subdomain via MELINDO_TENANT_SUBDOMAIN (default 'melindo').
 * - Idempotent: skips when tenant + matchType + normalized matchValue + account already exist.
 * - Validates every target account exists and is active in the tenant DB.
 * - Never prints credentials or connection strings.
 *
 * Usage:
 *   MELINDO_TENANT_SUBDOMAIN=melindo npx tsx scripts/migrate-melindo-revenue-rules.ts    # dry run
 *   MELINDO_TENANT_SUBDOMAIN=melindo APPLY=1 npx tsx scripts/migrate-melindo-revenue-rules.ts
 */
import { PrismaClient } from '@prisma/client';
import { getTenantDb } from '../src/lib/core/prisma';
import { MELINDO_REVENUE_RULES } from './data/melindo-revenue-rules';

const APPLY = process.env.APPLY === '1';
const SUBDOMAIN = process.env.MELINDO_TENANT_SUBDOMAIN ?? 'melindo';

function normalizeMatchValue(value: string): string {
    return value.trim().toLowerCase();
}

async function main() {
    const mainPrisma = new PrismaClient();
    try {
        const tenant = await mainPrisma.tenant.findUnique({
            where: { subdomain: SUBDOMAIN },
            select: { id: true, name: true, subdomain: true, dbUrl: true },
        });
        if (!tenant) {
            console.error(`Tenant dengan subdomain "${SUBDOMAIN}" tidak ditemukan.`);
            process.exit(1);
        }
        console.log(`Target tenant: ${tenant.name} (${tenant.subdomain})`);
        console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

        const tenantDb = getTenantDb(tenant.dbUrl);

        const existing = await mainPrisma.tenantRevenueRule.findMany({
            where: { tenantId: tenant.id },
        });
        const existingKeys = new Set(
            existing.map((r) =>
                [r.matchType, normalizeMatchValue(r.matchValue), r.accountCode ?? ''].join(
                    '|',
                ),
            ),
        );

        let planned = 0;
        let skipped = 0;

        for (const rule of MELINDO_REVENUE_RULES) {
            const account = await tenantDb.account.findUnique({
                where: { code: rule.accountCode },
            });
            if (!account || account.isActive === false) {
                console.warn(
                    `SKIP ${rule.matchType} "${rule.matchValue}" -> ${rule.accountCode}: akun tidak ada atau tidak aktif di tenant DB`,
                );
                skipped++;
                continue;
            }

            const key = [
                rule.matchType,
                normalizeMatchValue(rule.matchValue),
                rule.accountCode,
            ].join('|');
            if (existingKeys.has(key)) {
                console.log(
                    `SKIP (existing) ${rule.matchType} "${rule.matchValue}" -> ${rule.accountCode}`,
                );
                skipped++;
                continue;
            }

            console.log(
                `PLAN ${rule.matchType} "${rule.matchValue}" -> ${rule.accountCode} (${account.name})`,
            );
            planned++;

            if (APPLY) {
                await mainPrisma.tenantRevenueRule.create({
                    data: {
                        tenantId: tenant.id,
                        priority: rule.priority,
                        matchType: rule.matchType,
                        matchValue: rule.matchValue,
                        accountId: account.id,
                        accountCode: account.code,
                        accountName: account.name,
                        isActive: true,
                    },
                });
            }
        }

        console.log(`\nPlanned inserts: ${planned}`);
        console.log(`Skipped: ${skipped}`);
        if (!APPLY) {
            console.log('\nDry-run only. Re-run dengan APPLY=1 untuk menulis.');
        }
    } finally {
        await mainPrisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
