/**
 * Migrate existing SalesQuotation records into SalesOrder (unified lifecycle).
 *
 * Usage:
 *   DRY RUN (default):  DATABASE_URL=... npx tsx scripts/migrate-quotations-to-so.ts
 *   APPLY:              DATABASE_URL=... npx tsx scripts/migrate-quotations-to-so.ts --apply
 *
 * Per tenant: run separately with each tenant's DATABASE_URL.
 */

import { PrismaClient, SalesQuotationStatus } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

const prisma = new PrismaClient();

const STATUS_MAP: Record<string, string> = {
    DRAFT: 'QUOTATION',
    SENT: 'QUOTATION_SENT',
    ACCEPTED: 'DRAFT', // accepted → move to DRAFT (order phase)
    REJECTED: 'QUOTATION_REJECTED',
    EXPIRED: 'QUOTATION_EXPIRED',
    // CONVERTED → handled separately (link to existing SO)
};

function decimalToNumber(v: unknown): number {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v) || 0;
    if (typeof v === 'object' && 'toNumber' in v)
        return (v as { toNumber: () => number }).toNumber();
    return 0;
}

async function main() {
    console.log(
        `\n=== migrate-quotations-to-so (${APPLY ? 'APPLY' : 'DRY RUN'}) ===\n`,
    );

    const quotations = await prisma.salesQuotation.findMany({
        include: { items: true, salesOrders: true },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`Found ${quotations.length} quotations to process.\n`);

    let created = 0;
    let linked = 0;
    let skipped = 0;
    let orphans = 0;

    for (const sq of quotations) {
        const sqStatus = sq.status as string;

        // CONVERTED quotations: link to existing SO if found
        if (sqStatus === 'CONVERTED') {
            const existingSO = sq.salesOrders[0];
            if (existingSO) {
                if (APPLY) {
                    await prisma.salesOrder.update({
                        where: { id: existingSO.id },
                        data: {
                            legacyQuotationId: sq.id,
                            validUntil:
                                existingSO.validUntil ??
                                sq.validUntil ??
                                undefined,
                            subject:
                                existingSO.subject ?? sq.subject ?? undefined,
                            paymentTerms:
                                existingSO.paymentTerms ??
                                sq.paymentTerms ??
                                undefined,
                            shippingTerms:
                                existingSO.shippingTerms ??
                                sq.shippingTerms ??
                                undefined,
                            termsConditions:
                                existingSO.termsConditions ??
                                sq.termsConditions ??
                                undefined,
                        },
                    });
                }
                linked++;
                console.log(
                    `  [LINK] ${sq.quotationNumber} → SO ${existingSO.orderNumber} (legacyQuotationId set)`,
                );
            } else {
                orphans++;
                console.log(
                    `  [ORPHAN] ${sq.quotationNumber} — CONVERTED but no linked SO found`,
                );
            }
            continue;
        }

        // Map status
        const targetStatus = STATUS_MAP[sqStatus];
        if (!targetStatus) {
            skipped++;
            console.log(
                `  [SKIP] ${sq.quotationNumber} — unknown status "${sqStatus}"`,
            );
            continue;
        }

        // Check if SO with this legacyQuotationId already exists (idempotent)
        const existing = await prisma.salesOrder.findFirst({
            where: { legacyQuotationId: sq.id },
        });
        if (existing) {
            skipped++;
            console.log(
                `  [SKIP] ${sq.quotationNumber} — SO already exists (${existing.orderNumber})`,
            );
            continue;
        }

        const orderNumber = sq.quotationNumber; // Keep SQ number as orderNumber (unique prefix)

        if (APPLY) {
            const so = await prisma.salesOrder.create({
                data: {
                    orderNumber,
                    customerId: sq.customerId,
                    orderDate: sq.quotationDate,
                    orderType: 'MAKE_TO_STOCK',
                    status: targetStatus as never,
                    totalAmount: sq.totalAmount,
                    discountAmount: sq.discountAmount,
                    taxAmount: sq.taxAmount,
                    notes: sq.notes,
                    createdById: sq.createdById,
                    validUntil: sq.validUntil ?? undefined,
                    subject: sq.subject ?? undefined,
                    paymentTerms: sq.paymentTerms ?? undefined,
                    shippingTerms: sq.shippingTerms ?? undefined,
                    termsConditions: sq.termsConditions ?? undefined,
                    legacyQuotationId: sq.id,
                    quotationSentAt:
                        sqStatus === 'SENT'
                            ? (sq.updatedAt ?? sq.createdAt)
                            : undefined,
                    priceStatus:
                        targetStatus === 'DRAFT'
                            ? 'PROVISIONAL'
                            : sqStatus === 'SENT'
                              ? 'PROVISIONAL'
                              : 'PENDING',
                    items: {
                        create: sq.items.map((item) => ({
                            productVariantId: item.productVariantId,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            enteredQuantity: item.enteredQuantity,
                            enteredUnit: item.enteredUnit,
                            conversionFactorSnapshot:
                                item.conversionFactorSnapshot,
                            enteredUnitPrice: item.enteredUnitPrice,
                            discountPercent: item.discountPercent,
                            taxPercent: item.taxPercent,
                            taxAmount: item.taxAmount,
                            subtotal: item.subtotal,
                        })),
                    },
                },
            });
            created++;
            console.log(
                `  [CREATE] ${sq.quotationNumber} → SO ${so.orderNumber} (${targetStatus})`,
            );
        } else {
            created++;
            console.log(
                `  [DRY] ${sq.quotationNumber} → SO ${orderNumber} (${targetStatus})`,
            );
        }
    }

    console.log(`\n=== Summary ===`);
    console.log(`  Created: ${created}`);
    console.log(`  Linked (legacyQuotationId): ${linked}`);
    console.log(`  Skipped (already exists): ${skipped}`);
    console.log(`  Orphans: ${orphans}`);
    console.log(`  Total: ${quotations.length}`);
    console.log();
}

main()
    .catch((e) => {
        console.error('Migration failed:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
