/**
 * Audit script: list RolePermission rows whose resource is not in the
 * permission catalog (orphans from renamed/removed routes).
 *
 * Usage:
 *   npx tsx scripts/audit-permission-orphans.ts
 *
 * Or against a specific tenant DB:
 *   DATABASE_URL=... npx tsx scripts/audit-permission-orphans.ts
 */
import { PrismaClient, Role } from "@prisma/client";
import { flattenCatalog, getFeatureCatalog } from "../src/lib/auth/permission-catalog";

const prisma = new PrismaClient();

async function main() {
  const catalogKeys = new Set([
    ...flattenCatalog().map((n) => n.key),
    ...getFeatureCatalog().map((f) => f.key),
  ]);

  // Legacy resources that pre-date the catalog but are still valid grants
  // (e.g. /production/dispatch was renamed; keep grandfathered list here).
  const knownLegacy = new Set<string>([
    "/production/dispatch", // removed from sidebar, still in old seeds
  ]);

  const all = await prisma.rolePermission.findMany({
    select: { role: true, resource: true, canAccess: true },
  });

  const orphans = all.filter(
    (p) => !catalogKeys.has(p.resource) && !knownLegacy.has(p.resource),
  );

  if (orphans.length === 0) {
    console.log("✓ No orphan permissions found.");
    return;
  }

  console.log(`Found ${orphans.length} orphan permission(s):\n`);
  console.log("ROLE        | RESOURCE                          | canAccess");
  console.log("------------|-----------------------------------|----------");
  for (const o of orphans) {
    console.log(
      `${o.role.padEnd(11)} | ${o.resource.padEnd(33)} | ${o.canAccess}`,
    );
  }

  const byRole = new Map<Role, string[]>();
  for (const o of orphans) {
    const arr = byRole.get(o.role) ?? [];
    arr.push(o.resource);
    byRole.set(o.role, arr);
  }
  console.log("\nSummary by role:");
  for (const [role, resources] of byRole) {
    console.log(`  ${role}: ${resources.length} orphan(s)`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
