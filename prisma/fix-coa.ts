
import { PrismaClient } from '@prisma/client';
import { seedCoA } from './seed-coa';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting safe production data fix...');
    await seedCoA();
    console.log('Safe production data fix completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
