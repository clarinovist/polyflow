import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Running Production Patch: Adding WIP Storage Location...');

    const wipLocation = {
        name: 'WIP Storage',
        slug: 'wip_storage',
        description: 'Work-in-Progress storage for Roll Film before Converting'
    };

    // Safe Upsert: Only creates if not exists, or updates description/name if exists.
    // Does NOT delete any data.
    const result = await prisma.location.upsert({
        where: { slug: wipLocation.slug },
        update: wipLocation,
        create: wipLocation,
    });

    console.log(`✅ Successfully patched location: ${result.name} (${result.slug})`);
}

main()
    .catch((e) => {
        console.error('❌ Error applying patch:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
