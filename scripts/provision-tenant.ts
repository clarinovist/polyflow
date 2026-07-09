import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);
const prisma = new PrismaClient(); // Connects to Main DB as defined in .env

async function provisionTenant() {
    console.log("=== Polyflow Tenant Provisioning ===");

    const args = process.argv.slice(2);
    if (args.length < 3) {
        console.error("Usage: npx tsx scripts/provision-tenant.ts <tenant_name> <subdomain> <db_url>");
        console.log("Example: npx tsx scripts/provision-tenant.ts 'PT ABC' pt-abc postgresql://user:pass@localhost:5432/pt_abc");
        process.exit(1);
    }

    const [name, subdomain, dbUrl] = args;

    try {
        // 1. Check if subdomain already exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { subdomain }
        });

        if (existingTenant) {
            console.error(`\n❌ Error: Subdomain '${subdomain}' is already registered to Tenant ID: ${existingTenant.id}`);
            process.exit(1);
        }

        console.log(`\n⏳ Provisioning New Tenant: ${name} (${subdomain})`);
        console.log(`-> Database URL: ${dbUrl}`);

        // 2. Run Database Migrations for the new tenant DB
        console.log(`\n🔄 Running Prisma Migrations on the new database...`);
        const { stdout, stderr } = await execPromise(`DATABASE_URL="${dbUrl}" npx prisma@5.22.0 migrate deploy`);

        if (stdout) console.log(stdout);
        if (stderr) console.error(stderr);

        // 3. Register Tenant in the Main DB
        console.log(`\n📝 Registering Tenant in Main Database...`);
        const newTenant = await prisma.tenant.create({
            data: {
                name,
                subdomain,
                dbUrl,
                status: 'ACTIVE',
                plan: 'TRIAL'
            }
        });

        console.log(`\n✅ Successfully provisioned tenant:`);
        console.table(newTenant);

        // Optional: Run Tenant Seeding
        // console.log(`\n🌱 Seeding initial data...`);
        // await execPromise(`DATABASE_URL="${dbUrl}" npx tsx prisma/seed.ts`);

        // Best-effort: seed role→account mappings if COA already exists on tenant DB.
        // Safe when COA is empty (roles land in failed[]); re-run seed script later after COA seed.
        try {
            console.log(`\n🔗 Seeding TenantAccountRole mappings (create-only)...`);
            const { getTenantDb } = await import('../src/lib/core/prisma');
            const { seedTenantAccountRoles } = await import('../src/services/accounting/coa-seed-service');
            const tenantDb = getTenantDb(dbUrl);
            const seedResult = await seedTenantAccountRoles({
                tenantId: newTenant.id,
                tenantDb,
                force: false,
            });
            console.log(
                `  Created: ${seedResult.created}, skipped: ${seedResult.skipped}, failed: ${seedResult.failed.length}`,
            );
            if (seedResult.failed.length > 0) {
                console.log(
                    `  (Failed roles usually mean COA not seeded yet — run scripts/seed-tenant-account-roles.ts after COA seed.)`,
                );
            }
        } catch (seedErr) {
            console.warn(`\n⚠️  Role mapping seed skipped:`, seedErr);
        }

    } catch (error) {
        console.error("\n❌ Provisioning failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

provisionTenant();
