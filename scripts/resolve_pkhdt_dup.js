const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resolveDuplicates() {
    console.log('--- Resolving Duplicate Default BOMs for PKHDT002 ---');
    try {
        // We already know the ID for 'Mixed HMP 15' is 99524515-4024-455d-ba59-3263552d900b
        await prisma.bom.update({
            where: { id: '99524515-4024-455d-ba59-3263552d900b' },
            data: { isDefault: false }
        });
        console.log('Successfully deactivated "Mixed HMP 15" as default.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resolveDuplicates();
