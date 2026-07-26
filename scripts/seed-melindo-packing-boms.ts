import { prisma } from '@/lib/core/prisma';

export async function seedMelindoPackingBoms() {
    console.log('Seeding Melindo Packing BOMs...');

    // Ensure RHS0000 exists
    const rhsProduct = await prisma.productVariant.findFirst({
        where: { skuCode: 'RHS0910' },
        select: { productId: true },
    });

    if (rhsProduct) {
        await prisma.productVariant.upsert({
            where: { skuCode: 'RHS0000' },
            update: {},
            create: {
                id: 'var-rhs0000',
                skuCode: 'RHS0000',
                name: 'Rafia Hitam Super',
                primaryUnit: 'KG',
                productId: rhsProduct.productId,
            },
        });
    }

    // Ensure SHS00WL-KT exists
    const shsProduct = await prisma.productVariant.findFirst({
        where: { skuCode: 'SHS00WL-00' },
        select: { productId: true },
    });

    if (shsProduct) {
        await prisma.productVariant.upsert({
            where: { skuCode: 'SHS00WL-KT' },
            update: {},
            create: {
                id: 'var-shs00wl-kt',
                skuCode: 'SHS00WL-KT',
                name: 'Sedotan Hitam Steril Full Polos (Karton)',
                primaryUnit: 'KARTON',
                productId: shsProduct.productId,
            },
        });
    }

    const bomsToSeed = [
        {
            id: 'bom-s1-rafia-bal',
            skuCode: 'RHK1010',
            name: 'BOM Packing Rafia Hitam KW 1 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RHK0000', qty: 10 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-s2-sedotan-pack',
            skuCode: 'SHS00WL-00',
            name: 'BOM Packing Sedotan Hitam Steril 250',
            outputQty: 1,
            items: [
                { processSku: 'SHP00WL', qty: 0.25 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-s3-sedotan-karton',
            skuCode: 'SHS00WL-KT',
            name: 'BOM Packing Sedotan Steril Karton',
            outputQty: 1,
            items: [
                { processSku: 'SHS00WL-00', qty: 20 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rhk0510',
            skuCode: 'RHK0510',
            name: 'BOM Packing Rafia Hitam KW 0.5 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RHK0000', qty: 5 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rhs0910',
            skuCode: 'RHS0910',
            name: 'BOM Packing Rafia Hitam Super 0.9 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RHS0000', qty: 9 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rhs1010',
            skuCode: 'RHS1010',
            name: 'BOM Packing Rafia Hitam Super 1 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RHS0000', qty: 10 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rrk0110',
            skuCode: 'RRK0110',
            name: 'BOM Packing Rafia Biru KW 1 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RRK0000', qty: 10 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rkk1010',
            skuCode: 'RKK1010',
            name: 'BOM Packing Rafia Kuning KW 1 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RKK0000', qty: 10 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rmk1010',
            skuCode: 'RMK1010',
            name: 'BOM Packing Rafia Merah KW 1 (10)',
            outputQty: 1,
            items: [
                { processSku: 'RMK0000', qty: 10 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-rwm0760',
            skuCode: 'RWM0760',
            name: 'BOM Packing Rafia Warna Super Mix 0.7 (6)',
            outputQty: 1,
            items: [
                { processSku: 'RBS0000', qty: 4.2 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-sjs00wl11',
            skuCode: 'SJS00WL-11',
            name: 'BOM Packing Sedotan Hijau Steril Full Printing',
            outputQty: 1,
            items: [
                { processSku: 'SJP00ST6', qty: 0.25 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-inv0041',
            skuCode: 'INV-0041',
            name: 'BOM Packing Sedotan Hitam Steril Full Polos 500',
            outputQty: 1,
            items: [
                { processSku: 'SHP00WL', qty: 0.5 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
        {
            id: 'bom-inv0055',
            skuCode: 'INV-0055',
            name: 'BOM Packing Sedotan Warna Pop Ice Tumpul 130gr',
            outputQty: 1,
            items: [
                { processSku: 'SBP00WL55', qty: 0.13 },
                { supplySku: 'BK121001', qty: 1 },
            ],
        },
    ];

    for (const bomDef of bomsToSeed) {
        const targetVariant = await prisma.productVariant.findFirst({
            where: { skuCode: bomDef.skuCode },
        });

        if (!targetVariant) {
            console.warn(
                `Target variant ${bomDef.skuCode} not found, skipping.`,
            );
            continue;
        }

        const createdBom = await prisma.bom.upsert({
            where: { id: bomDef.id },
            update: {
                name: bomDef.name,
                category: 'PACKING',
                outputQuantity: bomDef.outputQty,
                isDefault: true,
                isActive: true,
            },
            create: {
                id: bomDef.id,
                name: bomDef.name,
                description: 'Melindo PACKING BOM Batch',
                productVariantId: targetVariant.id,
                category: 'PACKING',
                outputQuantity: bomDef.outputQty,
                isDefault: true,
                isActive: true,
            },
        });

        for (let idx = 0; idx < bomDef.items.length; idx++) {
            const itemDef = bomDef.items[idx];
            const skuToFind = itemDef.processSku || itemDef.supplySku;
            const itemVariant = await prisma.productVariant.findFirst({
                where: { skuCode: skuToFind },
            });

            if (!itemVariant) continue;

            const itemId = `item-${bomDef.id}-${idx + 1}`;
            await prisma.bomItem.upsert({
                where: { id: itemId },
                update: {
                    quantity: itemDef.qty,
                },
                create: {
                    id: itemId,
                    bomId: createdBom.id,
                    productVariantId: itemVariant.id,
                    quantity: itemDef.qty,
                    scrapPercentage: 0,
                },
            });
        }
    }

    console.log('Melindo Packing BOMs seed finished successfully.');
}
