import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function migratePermissions() {
    console.log('🚀 Starting Warehouse portal permission migration...');

    const targetRoles: Role[] = ['ADMIN', 'WAREHOUSE', 'PRODUCTION', 'PPIC'];
    const resource = '/warehouse';

    for (const role of targetRoles) {
        try {
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
                    resource: resource,
                    canAccess: true,
                },
            });
            console.log(`✅ Granted access to ${resource} for role: ${role}`);
        } catch (error) {
            console.error(`❌ Failed to migrate permission for role ${role}:`, error);
        }
    }

    console.log('✨ Migration completed.');
}

migratePermissions()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
