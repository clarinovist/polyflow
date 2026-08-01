/**
 * Fix Melindo Rafia Stock Ledger — backfill saldo awal StockMovement yang hilang
 * saat sinkronisasi onboarding tenant (2026-06-29).
 *
 * Root cause: lihat docs/plan/2026-08-01-stock-ledger-opening-balance-gap-melindo-rafia.md
 * `Inventory` (real-time) sudah benar; `StockMovement` (sumber Stock Ledger) kehilangan
 * entry saldo awal untuk 75 varian saat proses sync onboarding — 74 di antaranya polanya
 * konsisten (ledger understate, opening balance hilang total), SATU (`KP00000`) polanya
 * berbeda (misrouted movement dari opname OPN-202607-0002 + sisa opening-balance gap
 * campuran) — sengaja DIKECUALIKAN dari batch ini, butuh fix manual terpisah.
 *
 * Mode default: DRY-RUN (print tabel mismatch, tidak menulis apa pun).
 * Idempotent: sebelum insert per (productVariantId, locationId), cek dulu belum ada
 * StockMovement dengan reference yang sama — aman kalau script di-run dua kali.
 *
 * Usage:
 *   npx tsx scripts/fix-melindo-stock-ledger-opening-balance.ts               (dry-run)
 *   npx tsx scripts/fix-melindo-stock-ledger-opening-balance.ts --apply       (tulis ke DB)
 *   npx tsx scripts/fix-melindo-stock-ledger-opening-balance.ts --tenant=xxx  (default: melindo)
 */

import { PrismaClient } from '@prisma/client';

const EXCLUDED_SKUS = ['KP00000'];
const OPENING_BALANCE_REFERENCE =
    'Opening Balance - Sinkronisasi Inventory (susulan)';
const OPENING_BALANCE_DATE = new Date('2026-06-29T00:00:00.000Z');
const MISMATCH_THRESHOLD = 0.01;

type CliArgs = { apply: boolean; tenantSubdomain: string };

function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    return {
        apply: args.includes('--apply'),
        tenantSubdomain:
            args.find((a) => a.startsWith('--tenant='))?.split('=')[1] ||
            'melindo',
    };
}

async function getTenantDbUrl(
    mainPrisma: PrismaClient,
    subdomain: string,
): Promise<{ id: string; dbUrl: string }> {
    const tenant = await mainPrisma.tenant.findFirst({
        where: { subdomain },
    });
    if (!tenant) throw new Error(`Tenant "${subdomain}" not found in main DB`);
    console.log(`Tenant: ${tenant.name} (${tenant.subdomain}) id=${tenant.id}`);
    return { id: tenant.id, dbUrl: tenant.dbUrl };
}

type MismatchRow = {
    productVariantId: string;
    skuCode: string;
    locationId: string;
    locationName: string;
    realQty: number;
    ledgerBalance: number;
    diff: number;
};

async function findMismatches(
    tenantPrisma: PrismaClient,
): Promise<MismatchRow[]> {
    const rows = await tenantPrisma.$queryRaw<
        {
            productVariantId: string;
            skuCode: string;
            locationId: string;
            locationName: string;
            realQty: string;
            ledgerBalance: string;
        }[]
    >`
        WITH ledger AS (
            SELECT "productVariantId", loc,
                   SUM(CASE WHEN dir = 'IN' THEN qty ELSE -qty END) AS "ledgerBalance"
            FROM (
                SELECT "productVariantId", "toLocationId" AS loc, quantity AS qty, 'IN' AS dir
                FROM "StockMovement" WHERE "toLocationId" IS NOT NULL
                UNION ALL
                SELECT "productVariantId", "fromLocationId" AS loc, quantity AS qty, 'OUT' AS dir
                FROM "StockMovement" WHERE "fromLocationId" IS NOT NULL
            ) x
            GROUP BY "productVariantId", loc
        ),
        real AS (
            SELECT "productVariantId", "locationId" AS loc, SUM(quantity) AS "realQty"
            FROM "Inventory"
            GROUP BY "productVariantId", "locationId"
        )
        SELECT
            pv.id AS "productVariantId",
            pv."skuCode" AS "skuCode",
            loc.id AS "locationId",
            loc.name AS "locationName",
            COALESCE(r."realQty", 0)::text AS "realQty",
            COALESCE(l."ledgerBalance", 0)::text AS "ledgerBalance"
        FROM real r
        FULL OUTER JOIN ledger l
            ON l."productVariantId" = r."productVariantId" AND l.loc = r.loc
        JOIN "ProductVariant" pv ON pv.id = COALESCE(r."productVariantId", l."productVariantId")
        JOIN "Location" loc ON loc.id = COALESCE(r.loc, l.loc)
        WHERE ABS(COALESCE(r."realQty", 0) - COALESCE(l."ledgerBalance", 0)) > ${MISMATCH_THRESHOLD}
        ORDER BY pv."skuCode";
    `;

    return rows.map((r) => ({
        productVariantId: r.productVariantId,
        skuCode: r.skuCode,
        locationId: r.locationId,
        locationName: r.locationName,
        realQty: Number(r.realQty),
        ledgerBalance: Number(r.ledgerBalance),
        diff: Number(r.realQty) - Number(r.ledgerBalance),
    }));
}

function printMismatches(rows: MismatchRow[]) {
    console.log(
        `\n${'SKU'.padEnd(12)} ${'Lokasi'.padEnd(34)} ${'Real'.padStart(12)} ${'Ledger'.padStart(12)} ${'Diff'.padStart(12)}`,
    );
    for (const row of rows) {
        console.log(
            `${row.skuCode.padEnd(12)} ${row.locationName.padEnd(34)} ${row.realQty.toFixed(2).padStart(12)} ${row.ledgerBalance.toFixed(2).padStart(12)} ${row.diff.toFixed(2).padStart(12)}`,
        );
    }
    console.log(`\nTotal baris mismatch: ${rows.length}`);
}

async function main() {
    const { apply, tenantSubdomain } = parseArgs();
    console.log('=== Fix Melindo Stock Ledger Opening Balance ===');
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Tenant: ${tenantSubdomain}\n`);

    const mainPrisma = new PrismaClient();
    const { dbUrl } = await getTenantDbUrl(mainPrisma, tenantSubdomain);
    const tenantPrisma = new PrismaClient({
        datasources: { db: { url: dbUrl } },
    });

    try {
        console.log('--- Mismatch SEBELUM fix ---');
        const before = await findMismatches(tenantPrisma);
        printMismatches(before);

        const excluded = before.filter((r) =>
            EXCLUDED_SKUS.includes(r.skuCode),
        );
        const toFix = before.filter(
            (r) =>
                !EXCLUDED_SKUS.includes(r.skuCode) &&
                r.diff > MISMATCH_THRESHOLD,
        );
        const unexpectedNegative = before.filter(
            (r) =>
                !EXCLUDED_SKUS.includes(r.skuCode) &&
                r.diff < -MISMATCH_THRESHOLD,
        );

        if (excluded.length > 0) {
            console.log(
                `\n⚠️  ${excluded.length} baris dikecualikan (${EXCLUDED_SKUS.join(', ')}) — perlu investigasi manual terpisah, TIDAK di-fix oleh script ini.`,
            );
        }
        if (unexpectedNegative.length > 0) {
            console.log(
                `\n⚠️  ${unexpectedNegative.length} baris punya diff NEGATIF di luar SKU excluded — pola tidak sesuai asumsi "opening balance hilang" (ledger > real). Butuh review manual, TIDAK di-fix otomatis:`,
            );
            printMismatches(unexpectedNegative);
        }

        console.log(
            `\nAkan ${apply ? 'MENULIS' : 'MENSIMULASIKAN'} ${toFix.length} StockMovement baru (opening balance susulan).`,
        );

        if (!apply) {
            console.log('\n🔍 DRY-RUN complete. Tidak ada perubahan ditulis.');
            console.log(
                `   Jalankan ulang dengan --apply untuk eksekusi (setelah approval user & backup StockMovement).`,
            );
            return;
        }

        console.log('\n--- APPLY: menulis StockMovement susulan ---');
        let inserted = 0;
        let skippedIdempotent = 0;

        await tenantPrisma.$transaction(async (tx) => {
            for (const row of toFix) {
                const existing = await tx.stockMovement.findFirst({
                    where: {
                        productVariantId: row.productVariantId,
                        toLocationId: row.locationId,
                        reference: OPENING_BALANCE_REFERENCE,
                    },
                });
                if (existing) {
                    skippedIdempotent += 1;
                    console.log(
                        `  skip ${row.skuCode} @ ${row.locationName} — sudah ada entry susulan (idempotent)`,
                    );
                    continue;
                }

                await tx.stockMovement.create({
                    data: {
                        productVariantId: row.productVariantId,
                        toLocationId: row.locationId,
                        fromLocationId: null,
                        type: 'ADJUSTMENT',
                        quantity: row.diff,
                        reference: OPENING_BALANCE_REFERENCE,
                        createdAt: OPENING_BALANCE_DATE,
                    },
                });
                inserted += 1;
                console.log(
                    `  + ${row.skuCode} @ ${row.locationName}: +${row.diff.toFixed(2)}`,
                );
            }
        });

        console.log(
            `\n✅ Selesai. Inserted: ${inserted}, skipped (idempotent): ${skippedIdempotent}`,
        );

        console.log(
            '\n--- Mismatch SETELAH fix (harus 0 kecuali excluded) ---',
        );
        const after = await findMismatches(tenantPrisma);
        printMismatches(after);
        const remainingUnexpected = after.filter(
            (r) => !EXCLUDED_SKUS.includes(r.skuCode),
        );
        if (remainingUnexpected.length > 0) {
            console.error(
                `\n❌ Masih ada ${remainingUnexpected.length} baris mismatch di luar excluded SKU — cek manual.`,
            );
            process.exitCode = 1;
        } else {
            console.log(
                '\n✅ Semua mismatch di luar excluded SKU sudah tertutup.',
            );
        }
    } catch (e) {
        console.error('❌ Failed:', e);
        process.exitCode = 1;
    } finally {
        await tenantPrisma.$disconnect();
        await mainPrisma.$disconnect();
    }
}

main();
