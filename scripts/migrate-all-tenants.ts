import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);
const prisma = new PrismaClient();

async function migrateAllTenants() {
    console.log("=== Polyflow Tenant Migrator ===");

    try {
        console.log("Fetching active tenants from registry...");
        const tenants = await prisma.tenant.findMany({
            where: {
                status: 'ACTIVE'
            }
        });

        if (tenants.length === 0) {
            console.log("No active tenants found.");
            process.exit(0);
        }

        console.log(`Found ${tenants.length} active tenants. Starting migrations...\n`);

        for (const tenant of tenants) {
            console.log(`[${tenant.subdomain}] Running migration...`);
            try {
                // Ensure we pass the exact DB URL to the Prisma CLI for this specific iteration
                const { stdout, stderr } = await execPromise(`DATABASE_URL="${tenant.dbUrl}" npx prisma migrate deploy`);

                // Keep output concise
                const updatedLines = stdout.split('\n').filter(line => line.includes('migration') || line.includes('Applied'));
                if (updatedLines.length > 0) {
                    console.log(`  -> ${updatedLines.join('\n  -> ')}`);
                } else {
                    console.log(`  -> Up to date.`);
                }

                if (stderr) console.error(`  -> Warning/Error: ${stderr}`);

            } catch (err) {
                console.error(`\n❌ Failed to migrate tenant ${tenant.subdomain} (${tenant.id}):`);
                console.error(err);
                // Depending on strictness, we might want to continue or abort.
                // For now, continue to other tenants but log the error.
            }
        }

        console.log("\n✅ All tenant migrations completed.");

    } catch (error) {
        console.error("\n❌ Migration loop failed:", error);
    } finally {
        await prisma.$disconnect();
    }
}

migrateAllTenants();
