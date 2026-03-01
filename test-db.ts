import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    try {
        const users = await prisma.user.findMany({ select: { email: true, isSuperAdmin: true } });
        console.log("Success! Users found:", users.length);
        console.log(users.filter(u => u.isSuperAdmin));
    } catch (e) {
        console.error("Prisma error:", e);
    }
}

main().finally(() => prisma.$disconnect());
