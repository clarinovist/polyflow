#!/usr/bin/env npx tsx
/**
 * Backfill script: Set FLOOR_ENTERED_BAL consumptionRule on karung ProductVariants
 * that are used in PACKING BOMs.
 *
 * Run: npx tsx src/scripts/backfill-karung-consumption-rule.ts
 *
 * Safety:
 * - Only updates variants that don't already have a consumptionRule set
 * - Logs before/after state
 * - Dry-run by default (set DRY_RUN=false to apply)
 */

import { prisma } from '@/lib/core/prisma';

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
    console.log('=== Karung Consumption Rule Backfill ===');
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
    console.log('');

    // Find all product variants used as materials in PACKING BOMs
    // that don't already have a consumptionRule set
    const karungCandidates = await prisma.$queryRaw<Array<{
        id: string;
        name: string;
        skuCode: string;
        productType: string;
        primaryUnit: string;
        attributes: string | null;
    }>>`
        SELECT DISTINCT
            pv.id,
            pv.name,
            pv."skuCode",
            pv."productType",
            pv."primaryUnit",
            pv.attributes::text
        FROM "BomItem" bi
        INNER JOIN "Bom" b ON b.id = bi."bomId"
        INNER JOIN "ProductVariant" pv ON pv.id = bi."productVariantId"
        WHERE b.category = 'PACKING'
            AND pv."primaryUnit" = 'PACK'
            AND pv.attributes IS NULL
        ORDER BY pv.name
    `;

    console.log(`Found ${karungCandidates.length} candidate variant(s) without consumptionRule:`);
    for (const v of karungCandidates) {
        console.log(`  - ${v.skuCode} | ${v.name} | type=${v.productType} | unit=${v.primaryUnit}`);
    }
    console.log('');

    if (karungCandidates.length === 0) {
        console.log('No variants need updating. Done.');
        return;
    }

    if (DRY_RUN) {
        console.log('DRY RUN — no changes applied. Set DRY_RUN=false to apply.');
        return;
    }

    let updated = 0;
    for (const variant of karungCandidates) {
        await prisma.productVariant.update({
            where: { id: variant.id },
            data: {
                attributes: { consumptionRule: 'FLOOR_ENTERED_BAL' },
            },
        });
        console.log(`✓ Updated: ${variant.skuCode} | ${variant.name}`);
        updated++;
    }

    console.log('');
    console.log(`Done. Updated ${updated} variant(s).`);

    // Verify
    const verify = await prisma.productVariant.findMany({
        where: {
            id: { in: karungCandidates.map(v => v.id) },
        },
        select: {
            id: true,
            name: true,
            skuCode: true,
            attributes: true,
        },
    });

    console.log('');
    console.log('Verification:');
    for (const v of verify) {
        const attrs = v.attributes as Record<string, unknown> | null;
        console.log(`  ${v.skuCode} | ${v.name} | rule=${attrs?.consumptionRule ?? 'NONE'}`);
    }
}

main()
    .catch((err) => {
        console.error('Error:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
