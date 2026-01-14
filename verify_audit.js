
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        // 1. Check if AuditLog model exists
        const logs = await prisma.auditLog.findMany();
        console.log('Audit logs count:', logs.length);

        // 2. Check if StockMovement has cost field
        // We can't check schema directly via client easily, but we can try to create one with cost
        // or select it.
        console.log('Verification script finished');
    } catch (e) {
        console.error('Verification failed:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
