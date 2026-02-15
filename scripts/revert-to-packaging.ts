
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Reverting Products Back to PACKAGING (with correct GL accounts) ---');

    const targets = [
        'HD TRANS REGULER (BAG)',
        'HD HIJAU REGULER (BAG)',
        'HD UNGU (BAG)',
        'HPR (BAG)',
        'PG OZ (BAG)',
        'HD JUMBO (BAG)'
    ];

    // 1. Ensure correct GL accounts are set
    const accInvFG = await prisma.account.findFirst({ where: { code: '11210' } }); // Persediaan Barang Jadi
    const accCogsFG = await prisma.account.findFirst({ where: { code: '50000' } }); // HPP

    if (!accInvFG || !accCogsFG) {
        console.error('Critical accounts (11210, 50000) not found. Aborting.');
        return;
    }

    for (const name of targets) {
        const product = await prisma.product.findFirst({ where: { name } });

        if (product) {
            // Revert to PACKAGING but keep correct GL accounts
            await prisma.product.update({
                where: { id: product.id },
                data: {
                    productType: 'PACKAGING',
                    inventoryAccountId: accInvFG.id,   // 11210 (Barang Jadi), NOT 11340 (Bahan Kemasan)
                    cogsAccountId: accCogsFG.id        // 50000 (HPP), NOT 51700 (Biaya Kemasan)
                }
            });
            console.log(`✅ ${name} -> PACKAGING (GL: 11210/50000)`);
        } else {
            // Try without (BAG) suffix
            const oldName = name.replace(' (BAG)', '');
            const product2 = await prisma.product.findFirst({ where: { name: oldName } });
            if (product2) {
                await prisma.product.update({
                    where: { id: product2.id },
                    data: {
                        productType: 'PACKAGING',
                        inventoryAccountId: accInvFG.id,
                        cogsAccountId: accCogsFG.id
                    }
                });
                console.log(`✅ ${oldName} -> PACKAGING (GL: 11210/50000)`);
            } else {
                console.log(`⚠️ "${name}" not found.`);
            }
        }
    }

    // 2. Rename back (remove BAG suffix)
    console.log('\n--- Removing (BAG) suffix ---');
    const renames = [
        { from: 'HD TRANS REGULER (BAG)', to: 'HD TRANS REGULER' },
        { from: 'HD HIJAU REGULER (BAG)', to: 'HD HIJAU REGULER' },
        { from: 'HD UNGU (BAG)', to: 'HD UNGU' },
        { from: 'HPR (BAG)', to: 'HPR' },
        { from: 'PG OZ (BAG)', to: 'PG OZ' },
        { from: 'HD JUMBO (BAG)', to: 'HD JUMBO' }
    ];

    for (const r of renames) {
        const product = await prisma.product.findFirst({ where: { name: r.from } });
        if (product) {
            await prisma.product.update({
                where: { id: product.id },
                data: { name: r.to }
            });
            console.log(`Renamed "${r.from}" -> "${r.to}"`);
        }
    }

    console.log('\n✅ Done. Products are PACKAGING type with correct GL accounts (11210/50000).');
}

main();
