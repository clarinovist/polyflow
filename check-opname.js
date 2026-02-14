
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkOpname() {
    try {
        const count = await prisma.stockOpname.count();
        console.log(`Existing StockOpname count: ${count}`);
    } catch (error) {
        console.error("Error checking opname:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkOpname();
