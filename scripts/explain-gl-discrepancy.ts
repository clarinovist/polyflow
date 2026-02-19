/**
 * Script: explain-gl-discrepancy.ts  
 * Analisis detail mengapa GL vs Physical valuation masih ada selisih
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('=== Analisis Selisih GL vs Physical Inventory ===\n');

    // GL balances per akun
    const glByAccount: Record<string, number> = {};
    const codes = ['11310', '11320', '11330', '11340', '11350'];
    for (const code of codes) {
        const acc = await prisma.account.findUnique({
            where: { code },
            include: { journalLines: { where: { journalEntry: { status: 'POSTED' } } } }
        });
        if (acc) glByAccount[code] = acc.journalLines.reduce((s, l) => s + Number(l.debit) - Number(l.credit), 0);
    }

    // Physical valuation per productType, dan map ke GL account
    const typeToAccount: Record<string, string> = {
        RAW_MATERIAL: '11310',
        INTERMEDIATE: '11320',
        WIP: '11320',
        FINISHED_GOOD: '11330',
        PACKAGING: '11340',
        SCRAP: '11350'
    };

    const stock = await prisma.inventory.findMany({
        include: { productVariant: { include: { product: true } } }
    });

    const physByAccount: Record<string, number> = {};
    const physByType: Record<string, { qty: number, value: number, zeroCount: number }> = {};

    for (const item of stock) {
        const type = item.productVariant.product.productType;
        const qty = Number(item.quantity);
        const cost = Number(item.averageCost ?? 0) ||
            Number(item.productVariant.standardCost ?? 0) ||
            Number(item.productVariant.buyPrice ?? 0) ||
            Number(item.productVariant.price ?? 0);
        const val = qty * cost;
        const acc = typeToAccount[type] || '11300';

        physByAccount[acc] = (physByAccount[acc] || 0) + val;
        if (!physByType[type]) physByType[type] = { qty: 0, value: 0, zeroCount: 0 };
        physByType[type].qty += qty;
        physByType[type].value += val;
        if (qty > 0 && cost === 0) physByType[type].zeroCount++;
    }

    console.log('Akun    | GL Balance       | Physical Val    | Selisih');
    console.log('--------------------------------------------------------------');
    let totalGL = 0, totalPhys = 0;
    for (const code of codes) {
        const gl = glByAccount[code] || 0;
        const phys = physByAccount[code] || 0;
        const diff = gl - phys;
        totalGL += gl;
        totalPhys += phys;
        console.log(`${code}   | Rp ${gl.toLocaleString().padStart(15)} | Rp ${phys.toLocaleString().padStart(13)} | ${diff >= 0 ? '+' : ''}Rp ${diff.toLocaleString()}`);
    }
    console.log('--------------------------------------------------------------');
    console.log(`TOTAL   | Rp ${totalGL.toLocaleString().padStart(15)} | Rp ${totalPhys.toLocaleString().padStart(13)} | +Rp ${(totalGL - totalPhys).toLocaleString()}`);

    console.log('\n--- Penjelasan selisih per akun ---');

    // 11310 gap
    const gl11310 = glByAccount['11310'] || 0;
    const phys11310 = physByAccount['11310'] || 0;
    console.log(`\n11310 Gap: Rp ${(gl11310 - phys11310).toLocaleString()}`);
    console.log('  Kemungkinan penyebab:');
    console.log('  - GL mencakup pembelian RM historis yang sudah dipakai, tapi masih ada saldo negatif dari pemakaian');
    console.log('  - Physical tidak menghitung RM dengan qty negatif');

    // 11330 gap
    const gl11330 = glByAccount['11330'] || 0;
    const phys11330 = physByAccount['11330'] || 0;
    console.log(`\n11330 Gap: Rp ${(gl11330 - phys11330).toLocaleString()}`);
    console.log('  Kemungkinan: Rp 96M dari 12500 direklas ke sini, tapi physical FINISHED_GOOD hanya Rp 9M');
    console.log('  → Inventory fisik Roll sudah habis terjual/dipakai, tapi jurnal belum ada untuk COGS-nya');

    // 11320 gap
    const gl11320 = glByAccount['11320'] || 0;
    const phys11320 = physByAccount['11320'] || 0;
    console.log(`\n11320 Gap: Rp ${(gl11320 - phys11320).toLocaleString()}`);
    console.log('  Kemungkinan: WIP GL masih ada dari produksi yang belum di-complete journal-nya');

    // Cek FINISHED_GOOD sisa fisik Roll
    console.log('\n--- Sisa stok FINISHED_GOOD (Roll Jumbo) ---');
    const fgStock = await prisma.inventory.findMany({
        where: { productVariant: { product: { productType: 'FINISHED_GOOD' } }, quantity: { gt: 0 } },
        select: { quantity: true, averageCost: true, productVariant: { select: { name: true, standardCost: true } }, location: { select: { name: true } } }
    });
    fgStock.forEach(i => {
        const cost = Number(i.averageCost ?? 0) || Number(i.productVariant.standardCost ?? 0);
        console.log(`  ${i.productVariant.name} @ ${i.location.name}: qty=${Number(i.quantity).toFixed(2)} cost=${cost.toLocaleString()} val=Rp ${(Number(i.quantity) * cost).toLocaleString()}`);
    });
}

main().catch(console.error).finally(() => prisma.$disconnect());
