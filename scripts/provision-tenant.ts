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

    } catch (error) {
        console.error("\n❌ Provisioning failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

provisionTenant();
