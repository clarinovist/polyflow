#!/usr/bin/env tsx
/**
 * Seed kiosk.prosesKhususEnabled=true for the Kiyowo tenant (film-bag process).
 *
 * Backs the removal of the source-code subdomain allowlist: Kiyowo must carry an
 * explicit setting so the kiosk keeps showing HD / Potong-Plong after the code
 * switch. Melindo stays unset (fail-closed false).
 *
 * SAFETY:
 * - Dry-run by default. Set APPLY=1 to write.
 * - Requires explicit tenant subdomain via TARGET_TENANT_SUBDOMAIN (default 'kiyowo').
 * - Idempotent: skip when the setting is already "true".
 * - Never prints credentials or connection strings.
 * - Production execution only after backup and explicit user approval.
 *
 * Usage:
 *   npx tsx scripts/data/seed-kiyowo-kiosk-setting.ts                  # dry run
 *   APPLY=1 npx tsx scripts/data/seed-kiyowo-kiosk-setting.ts          # write
 */
import { PrismaClient } from '@prisma/client';
import { getTenantDb } from '../../src/lib/core/prisma';
import { KIOSK_PROSES_KHUSUS_SETTING_KEY } from '../../src/lib/kiosk/tenant-features';

const APPLY = process.env.APPLY === '1';
const TARGET = process.env.TARGET_TENANT_SUBDOMAIN ?? 'kiyowo';
const VERIFY = process.env.VERIFY_TENANT_SUBDOMAIN ?? 'melindo';

async function main() {
    const mainPrisma = new PrismaClient();
    try {
        const target = await mainPrisma.tenant.findUnique({
            where: { subdomain: TARGET },
            select: { id: true, name: true, subdomain: true, dbUrl: true },
        });
        if (!target) {
            console.error(`Tenant dengan subdomain "${TARGET}" tidak ditemukan.`);
            process.exit(1);
        }
        console.log(`Target tenant: ${target.name} (${target.subdomain})`);
        console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

        const tenantDb = getTenantDb(target.dbUrl);

        const existing = await tenantDb.appSetting.findUnique({
            where: { key: KIOSK_PROSES_KHUSUS_SETTING_KEY },
            select: { value: true },
        });

        if (existing?.value === 'true') {
            console.log(
                `SETTING sudah aktif (value="${existing.value}"). Tidak ada perubahan.`,
            );
        } else {
            console.log(
                `PLAN upsert ${KIOSK_PROSES_KHUSUS_SETTING_KEY} = "true" (current: ${existing?.value ?? 'null'})`,
            );
            if (APPLY) {
                await tenantDb.appSetting.upsert({
                    where: { key: KIOSK_PROSES_KHUSUS_SETTING_KEY },
                    create: {
                        key: KIOSK_PROSES_KHUSUS_SETTING_KEY,
                        value: 'true',
                        updatedBy: 'system',
                    },
                    update: {
                        value: 'true',
                        updatedBy: 'system',
                    },
                });
                console.log('APPLIED.');
            }
        }

        const check = await tenantDb.appSetting.findUnique({
            where: { key: KIOSK_PROSES_KHUSUS_SETTING_KEY },
            select: { value: true },
        });
        console.log(
            `\n[VERIFY] ${target.subdomain}: ${KIOSK_PROSES_KHUSUS_SETTING_KEY} = ${check?.value ?? 'null'}`,
        );

        const verifyTenant = await mainPrisma.tenant.findUnique({
            where: { subdomain: VERIFY },
            select: { name: true, subdomain: true, dbUrl: true },
        });
        if (verifyTenant) {
            const verifyDb = getTenantDb(verifyTenant.dbUrl);
            const other = await verifyDb.appSetting.findUnique({
                where: { key: KIOSK_PROSES_KHUSUS_SETTING_KEY },
                select: { value: true },
            });
            console.log(
                `[VERIFY] ${verifyTenant.subdomain}: ${KIOSK_PROSES_KHUSUS_SETTING_KEY} = ${other?.value ?? 'null'}`,
            );
        }

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
