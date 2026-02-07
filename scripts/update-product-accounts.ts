
import { prisma } from '../src/lib/prisma';

async function main() {
    console.log('🔄 Mapping HD Bag products to specialized COA...');

    const products = await prisma.product.findMany();

    for (const prod of products) {
        let invCode = '12100'; // Default: HDPE Virgin Resin
        let cogsCode = '51110'; // Default: HPP HDPE Virgin
        const wipCode = '12400'; // Persediaan WIP - Roll Jumbo

        const name = prod.name.toUpperCase();

        if (prod.productType === 'FINISHED_GOOD') {
            invCode = '12500'; // Persediaan Barang Jadi - Pack/Kresek
            cogsCode = '50000'; // General HPP for FGs
        } else if (prod.productType === 'WIP' || prod.productType === 'INTERMEDIATE' || name.includes('ROLL')) {
            invCode = '12400'; // Persediaan WIP - Roll Jumbo
            cogsCode = '50000'; // Mapping WIP consumption to general HPP or specific
        } else if (prod.productType === 'SCRAP' || name.includes('AFFAL')) {
            invCode = '12310'; // Persediaan Recycle Internal (Regrind)
            cogsCode = '65200'; // Associated with Biaya Proses Daur Ulang
        } else if (prod.productType === 'PACKAGING' || name.includes('KARUNG') || name.includes('GONI')) {
            invCode = '12610';
            cogsCode = '51150';
        } else if (name.includes('SLONGSONG') || name.includes('CORE')) {
            invCode = '12620';
            cogsCode = '51160';
        } else if (prod.productType === 'RAW_MATERIAL') {
            if (name.includes('DAUR') || name.includes('RECYCLE') || name.includes('GILINGAN')) {
                invCode = '12120';
                cogsCode = '51120';
            } else if (name.includes('MASTERBATCH') || name.includes('COLORANT') || name.includes('PEWARNA')) {
                invCode = '12210';
                cogsCode = '51130';
            } else if (name.includes('KALSIUM') || name.includes('FILLER') || name.includes('ADDITIVE') || name.includes('ADITIF')) {
                invCode = '12220';
                cogsCode = '51140';
            } else {
                invCode = '12100';
                cogsCode = '51110';
            }
        }

        const invAcc = await prisma.account.findUnique({ where: { code: invCode } });
        const cogsAcc = await prisma.account.findUnique({ where: { code: cogsCode } });
        const wipAcc = await prisma.account.findUnique({ where: { code: wipCode } });

        await prisma.product.update({
            where: { id: prod.id },
            data: {
                inventoryAccountId: invAcc?.id,
                cogsAccountId: cogsAcc?.id,
                wipAccountId: wipAcc?.id
            }
        });

        console.log(`✅ Product: ${prod.name} -> Inv: ${invCode}, COGS: ${cogsCode}`);
    }

    console.log('🏁 HD Bag product mapping complete!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
