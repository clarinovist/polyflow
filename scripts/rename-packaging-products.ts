
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Renaming Packaging Products to include (BAG) ---');

    const targets = [
        { old: 'HD TRANS REGULER', new: 'HD TRANS REGULER (BAG)' },
        { old: 'HD HIJAU REGULER', new: 'HD HIJAU REGULER (BAG)' },
        { old: 'HD UNGU', new: 'HD UNGU (BAG)' },
        { old: 'HPR', new: 'HPR (BAG)' },
        { old: 'PG OZ', new: 'PG OZ (BAG)' },
        { old: 'HD JUMBO', new: 'HD JUMBO (BAG)' }
    ];

    for (const t of targets) {
        // Check if product exists with old name
        const product = await prisma.product.findFirst({
            where: { name: t.old }
        });

        if (product) {
            console.log(`Renaming "${t.old}" -> "${t.new}"...`);
            await prisma.product.update({
                where: { id: product.id },
                data: { name: t.new }
            });
        } else {
            console.log(`Product "${t.old}" not found (maybe already renamed?).`);
        }
    }

    console.log('\n✅ Renaming Complete.');
}

main();
