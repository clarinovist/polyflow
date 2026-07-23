/**
 * Periodic audit: detect ghost Kiyowo COA in Melindo.
 * If any active ghost found OR any TenantAccountRole points to ghost, exit 1.
 *
 * Usage:
 *   npx tsx scripts/audit-melindo-ghost-accounts.ts --tenant=melindo
 *   Used in CI / cron.
 */

import { PrismaClient } from '@prisma/client';
const getTenantDb = (url: string) => new PrismaClient({ datasources: { db: { url } } });

const GHOST_CODES = new Set([
  '11110','11300','11310','11340','11350','21200','30000','51100','80000','81000','81100','90000','91000','91100',
]);

async function main() {
  const tenantArg = process.argv.find(a => a.startsWith('--tenant='))?.split('=')[1] || 'melindo';
  const mainPrisma = new PrismaClient();
  const tenant = await mainPrisma.tenant.findFirst({ where: { subdomain: tenantArg } });
  if (!tenant) throw new Error(`Tenant ${tenantArg} not found`);
  const tenantDb = getTenantDb(tenant.dbUrl);

  let fail = 0;

  // 1. Active ghost accounts
  const activeGhosts = await tenantDb.account.findMany({
    where: { code: { in: [...GHOST_CODES] }, isActive: true },
    select: { code: true, name: true },
  });
  if (activeGhosts.length > 0) {
    console.error(`❌ Active ghost accounts in ${tenantArg}:`);
    for (const a of activeGhosts) console.error(`  - ${a.code} ${a.name}`);
    fail++;
  } else {
    console.log(`✅ No active ghost codes in ${tenantArg}`);
  }

  // 2. Any ghost with non-zero balance (even inactive, should be 0 after fix)
  const allAccounts = await tenantDb.account.findMany({
    where: { code: { in: [...GHOST_CODES] } },
    select: { id: true, code: true, name: true },
  });
  for (const acc of allAccounts) {
    const agg = await tenantDb.journalLine.aggregate({
      where: { accountId: acc.id, journalEntry: { status: 'POSTED' } },
      _sum: { debit: true, credit: true },
    });
    const net = Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
    if (Math.abs(net) > 0.01) {
      console.error(`❌ Ghost ${acc.code} ${acc.name} has non-zero net ${net}`);
      fail++;
    }
  }
  if (fail === 0) console.log(`✅ All ghost balances zero`);

  // 3. TenantAccountRole pointing to ghost codes
  const roles = await mainPrisma.tenantAccountRole.findMany({ where: { tenantId: tenant.id } });
  const ghostRoles = roles.filter(r => r.accountCode && GHOST_CODES.has(r.accountCode));
  if (ghostRoles.length > 0) {
    console.error(`❌ TenantAccountRole pointing to ghost:`);
    for (const r of ghostRoles) console.error(`  - ${r.role} -> ${r.accountCode} ${r.accountName}`);
    fail++;
  } else {
    console.log(`✅ No TenantAccountRole pointing to ghost codes`);
  }

  // 4. Product.inventoryAccountId should not point to ghost
  const productsWithGhostInv = await tenantDb.$queryRawUnsafe(`
    SELECT p.id, p.name, acc.code as inv_code
    FROM "Product" p JOIN "Account" acc ON acc.id = p."inventoryAccountId"
    WHERE acc.code IN (${[...GHOST_CODES].map(c => `'${c}'`).join(',')})
  `) as any[];
  if (productsWithGhostInv.length > 0) {
    console.error(`❌ Products with ghost inventoryAccountId:`);
    for (const p of productsWithGhostInv) console.error(`  - ${p.name} -> ${p.inv_code}`);
    fail++;
  } else {
    console.log(`✅ No product points to ghost inventoryAccountId`);
  }

  await mainPrisma.$disconnect();

  if (fail > 0) {
    console.error(`\n❌ Audit FAILED with ${fail} issue(s)`);
    process.exit(1);
  } else {
    console.log(`\n✅ Audit PASSED`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
