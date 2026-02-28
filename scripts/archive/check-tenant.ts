import { PrismaClient } from '@prisma/client';
import { Client } from 'pg';

const prisma = new PrismaClient();

async function main() {
    const tenant = await prisma.tenant.findUnique({
        where: { subdomain: 'melindojaya' }
    });

    if (!tenant) {
        console.log('Tenant melindojaya not found in main DB');
        return;
    }

    console.log('Found tenant:', tenant.name, tenant.dbUrl);

    try {
        const client = new Client({ connectionString: tenant.dbUrl });
        await client.connect();
        const res = await client.query('SELECT id, name, email, role FROM "User"');
        console.log('Users in melindojaya DB:', res.rows);
        await client.end();
    } catch (e) {
        console.error('Error connecting to tenant db:', e);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
