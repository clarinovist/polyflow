const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { subdomain: 'melindo' }
    });
    console.log('Tenant found:', tenant ? 'YES' : 'NO');
    if (tenant) console.log('dbUrl:', tenant.dbUrl);
  } catch (e) {
    console.error('Error:', e.message);
  }
  await prisma.$disconnect();
}
test();
