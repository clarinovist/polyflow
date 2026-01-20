/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log('Adding Analytics permission to roles...');

    const roles = ['WAREHOUSE', 'PPIC'];
    const resource = '/dashboard/inventory/analytics';

    for (const role of roles) {
        try {
            // Upsert to ensure it exists
            await prisma.rolePermission.upsert({
                where: {
                    role_resource: {
                        role: role,
                        resource: resource,
                    },
                },
                update: { canAccess: true },
                create: {
                    role: role,
                    resource,
                    canAccess: true,
                },
            });
            console.log(`✅ Added ${resource} to ${role}`);
        } catch (e) {
            console.error(`❌ Failed to add to ${role}:`, e);
        }
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
