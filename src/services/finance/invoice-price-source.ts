import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { resolveAccount } from '@/services/accounting/account-resolver';
import {
    resolveRevenueAccount,
    type InvoiceItemForRevenue,
} from '@/services/accounting/revenue-account-resolver';
import { loadActiveTenantRevenueRules } from '@/services/accounting/tenant-revenue-rule-service';
import { readInvoiceSnapshot } from '@/lib/finance/invoice-snapshot';
import { z } from 'zod';
import { getTenantIdFromContext } from '@/lib/core/prisma';
import { calculateReturnProposal } from './return-credit-proposal';
import { journalMatchesPriceAdjustmentSource } from './invoice-price-revenue-source';
const zero = () => new Prisma.Decimal(0);
const unsigned = z.string().regex(/^\d{1,15}(\.\d{1,6})?$/);
const originalLineSchema = z.object({
    sourceItemId: z.string().min(1),
    productVariantId: z.string().min(1),
    quantity: unsigned.refine((v) => new Prisma.Decimal(v).gt(0)),
    netAmount: unsigned,
    taxAmount: unsigned,
    revenueAccountId: z.string().min(1).optional(),
});
type OriginalLine = z.infer<typeof originalLineSchema>;
const reviewedSchema = z.object({
    version: z.literal(1),
    originalLines: z.array(originalLineSchema).min(1),
});
const sameOriginalLine = (
    a: Omit<OriginalLine, 'revenueAccountId'>,
    b: Omit<OriginalLine, 'revenueAccountId'>,
) =>
    a.sourceItemId === b.sourceItemId &&
    a.productVariantId === b.productVariantId &&
    new Prisma.Decimal(a.quantity).equals(b.quantity) &&
    new Prisma.Decimal(a.netAmount).equals(b.netAmount) &&
    new Prisma.Decimal(a.taxAmount).equals(b.taxAmount);

/** Reconstruction is only a candidate: the entire source journal must still match. */
async function resolveItemRevenueAccounts(
    tx: Prisma.TransactionClient,
    lines: OriginalLine[],
    variants: Map<string, InvoiceItemForRevenue['variant']>,
    defaultRevenueId: string,
): Promise<Map<string, string>> {
    const tenantId = getTenantIdFromContext();
    const rules = lines.some((line) => !line.revenueAccountId)
        ? await loadActiveTenantRevenueRules(tenantId)
        : [];
    const resolved = new Map<string, string>();
    for (const line of lines) {
        if (line.revenueAccountId) {
            resolved.set(line.sourceItemId, line.revenueAccountId);
            continue;
        }
        const variant = variants.get(line.sourceItemId);
        if (!variant)
            throw new BusinessRuleError(
                'Bukti metadata item invoice tidak lengkap.',
            );
        const account = await resolveRevenueAccount(
            { quantity: 1, unitPrice: 0, variant },
            tx,
            rules,
            tenantId ?? 'default',
        );
        // This is the same fallback used by invoice issuance, not a guessed account.
        resolved.set(line.sourceItemId, account?.accountId ?? defaultRevenueId);
    }
    return resolved;
}
export async function getPriceAdjustmentSource(
    tx: Prisma.TransactionClient,
    invoiceId: string,
) {
    const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            salesOrder: {
                include: {
                    items: {
                        orderBy: { id: 'asc' },
                        include: {
                            productVariant: {
                                select: {
                                    name: true,
                                    primaryUnit: true,
                                    skuCode: true,
                                    revenueAccountId: true,
                                    product: {
                                        select: {
                                            id: true,
                                            name: true,
                                            revenueAccountId: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    deliveryOrders: {
                        where: { status: { in: ['SHIPPED', 'DELIVERED'] } },
                        select: { totalCharge: true },
                    },
                },
            },
            returnBasisLines: { orderBy: { id: 'asc' } },
        },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    if (!['UNPAID', 'PARTIAL', 'OVERDUE', 'PAID'].includes(invoice.status))
        throw new BusinessRuleError(
            'Penyesuaian hanya untuk invoice yang sudah diakui. Revisi draft melalui dokumen penjualan.',
        );
    if (!invoice.salesOrder.customerId)
        throw new BusinessRuleError('Customer invoice belum lengkap.');
    const [ar, vat, revenue] = await Promise.all([
        resolveAccount('accounts-receivable'),
        resolveAccount('vat-output'),
        resolveAccount('sales-revenue'),
    ]);
    const journals = await tx.journalEntry.findMany({
        where: {
            referenceType: 'SALES_INVOICE',
            referenceId: invoiceId,
            status: { not: 'VOIDED' },
        },
        include: { lines: { orderBy: { id: 'asc' } } },
        take: 2,
    });
    if (
        journals.length !== 1 ||
        journals[0].status !== 'POSTED' ||
        !journals[0].isAutoGenerated
    )
        throw new BusinessRuleError(
            'Jurnal invoice harus terverifikasi sebelum penyesuaian.',
        );
    const journal = journals[0];
    const arAmount = journal.lines
        .filter((l) => l.accountId === ar.id)
        .reduce((s, l) => s.plus(l.debit).minus(l.credit), zero());
    const tax = journal.lines
        .filter((l) => l.accountId === vat.id)
        .reduce((s, l) => s.plus(l.credit).minus(l.debit), zero());
    if (
        tax.lt(0) ||
        tax.gt(invoice.totalAmount) ||
        !arAmount.equals(invoice.totalAmount) ||
        !journal.lines
            .reduce((s, l) => s.plus(l.debit).minus(l.credit), zero())
            .isZero() ||
        journal.lines.some(
            (l) =>
                l.currency !== 'IDR' ||
                !l.exchangeRate.equals(1) ||
                l.debit.lt(0) ||
                l.credit.lt(0),
        )
    )
        throw new BusinessRuleError(
            'Jurnal invoice tidak cocok dengan nilai asli. Rekonsiliasi dahulu.',
        );
    const roundingAccount = invoice.roundingAmount?.gt(0)
        ? await resolveAccount('sales-rounding-income')
        : null;
    const existing = await tx.invoicePriceAdjustment.findMany({
        where: { invoiceId },
        orderBy: { id: 'asc' },
    });
    // Every previous approval (including reversals) binds the original attribution.
    // v1 rows predating account evidence were posted by the default-only service.
    let reviewedLines: OriginalLine[] | undefined;
    for (const adjustment of existing) {
        const parsed = reviewedSchema.safeParse(adjustment.sourceEvidence);
        if (!parsed.success || adjustment.sourceJournalId !== journal.id)
            throw new BusinessRuleError(
                'Bukti harga asli/jurnal penyesuaian tidak valid.',
            );
        const original = parsed.data.originalLines;
        const accountCount = original.filter((l) => l.revenueAccountId).length;
        if (accountCount !== 0 && accountCount !== original.length)
            throw new BusinessRuleError('Bukti akun harga asli tidak lengkap.');
        const historical = original.map((l) => ({
            ...l,
            revenueAccountId: l.revenueAccountId ?? revenue.id,
        }));
        const previous = reviewedLines;
        if (
            new Set(historical.map((l) => l.sourceItemId)).size !== historical.length ||
            (previous && (
                previous.length !== historical.length ||
                historical.some((line) => !previous.some((prior) =>
                    sameOriginalLine(line, prior) &&
                    line.revenueAccountId === prior.revenueAccountId,
                ))
            ))
        )
            throw new BusinessRuleError(
                'Bukti harga asli antar penyesuaian tidak cocok.',
            );
        reviewedLines = historical;
    }
    // Retain an original, audited basis after previous adjustments; never use new SO prices.
    let lines: OriginalLine[];
    let sourceLabel: string;
    if (invoice.returnBasisLines.length) {
        if (
            invoice.returnBasisLines.some(
                (l) =>
                    l.sourceJournalId !== journal.id ||
                    (l.sourceEvidence as Prisma.JsonObject)?.version !== 1 ||
                    (l.sourceEvidence as Prisma.JsonObject)
                        ?.capturedAtInvoiceCreation !== true,
            )
        )
            throw new BusinessRuleError('Bukti invoice asal belum valid.');
        lines = invoice.returnBasisLines.map((l) => ({
            sourceItemId: l.sourceItemId,
            productVariantId: l.productVariantId,
            quantity: l.quantity.toString(),
            netAmount: l.netAmount.toFixed(2),
            taxAmount: l.taxAmount.toFixed(2),
        }));
        sourceLabel = 'Snapshot invoice asal';
    } else if (reviewedLines) {
        lines = reviewedLines;
        sourceLabel =
            'Bukti harga asli pada persetujuan penyesuaian sebelumnya';
    } else {
        if (
            (await tx.invoice.count({
                where: {
                    salesOrderId: invoice.salesOrderId,
                    status: { not: 'CANCELLED' },
                },
            })) !== 1
        )
            throw new BusinessRuleError(
                'Invoice historis berulang pada SO memerlukan pemeriksaan sumber, bukan perkiraan harga.',
            );
        const hasDelivery = invoice.salesOrder.items.some((i) =>
            i.deliveredQty.gt(0),
        );
        const shipping = invoice.salesOrder.deliveryOrders.length
            ? invoice.salesOrder.deliveryOrders.reduce(
                  (s, d) => s.plus(d.totalCharge ?? 0),
                  zero(),
              )
            : new Prisma.Decimal(invoice.salesOrder.shippingCost ?? 0);
        lines = invoice.salesOrder.items
            .filter((i) => (hasDelivery ? i.deliveredQty : i.quantity).gt(0))
            .map((i) => {
                const quantity = hasDelivery ? i.deliveredQty : i.quantity;
                const v = calculateReturnProposal({
                    totalAmount: invoice.totalAmount,
                    roundingAmount: new Prisma.Decimal(
                        invoice.roundingAmount ?? 0,
                    ),
                    shippingAmount: shipping,
                    journalTax: tax,
                    items: invoice.salesOrder.items,
                    returned: [
                        {
                            productVariantId: i.productVariantId,
                            returnedQty: quantity,
                        },
                    ],
                    basis: [],
                });
                return {
                    sourceItemId: i.id,
                    productVariantId: i.productVariantId,
                    quantity: quantity.toString(),
                    netAmount: new Prisma.Decimal(v.totalAmount)
                        .minus(v.taxAmount)
                        .toFixed(2),
                    taxAmount: v.taxAmount,
                };
            });
        sourceLabel =
            'Rincian SO saat ini dicocokkan ke invoice/jurnal — wajib diperiksa Finance';
    }
    if (reviewedLines) {
        if (
            reviewedLines.length !== lines.length ||
            lines.some((line) => !reviewedLines.some((prior) => sameOriginalLine(line, prior)))
        )
            throw new BusinessRuleError(
                'Bukti harga asli tidak cocok dengan snapshot invoice.',
            );
        lines = reviewedLines;
    }
    if (
        !z.array(originalLineSchema).safeParse(lines).success ||
        !lines.length ||
        new Set(lines.map((l) => l.sourceItemId)).size !== lines.length ||
        new Set(lines.map((l) => l.productVariantId)).size !== lines.length
    )
        throw new BusinessRuleError('Atribusi item invoice kosong/ambigu.');
    if (
        lines
            .reduce((s, l) => s.plus(l.netAmount).plus(l.taxAmount), zero())
            .gt(invoice.totalAmount) ||
        !lines.reduce((s, l) => s.plus(l.taxAmount), zero()).equals(tax)
    )
        throw new BusinessRuleError(
            'Nilai sumber item/pajak tidak cocok dengan invoice asli.',
        );
    const credits = await tx.salesReturnCreditAllocation.findMany({
        where: { invoiceId, credit: { status: 'POSTED' } },
        include: { basisLine: true },
        orderBy: { id: 'asc' },
    });
    if (credits.some((c) => !c.basisLine || !c.quantity))
        throw new BusinessRuleError(
            'Invoice mempunyai kredit retur manual tanpa alokasi kuantitas. Rekonsiliasi sumber sebelum penyesuaian harga.',
        );
    const items = lines.map((line) => {
        const used = credits
            .filter((c) => c.basisLine?.sourceItemId === line.sourceItemId)
            .reduce((s, c) => s.plus(c.quantity!), zero());
        const active = existing.some(
            (a) =>
                a.sourceItemId === line.sourceItemId && a.status === 'POSTED',
        );
        const sourceItem = invoice.salesOrder.items.find(
            (i) =>
                i.id === line.sourceItemId &&
                i.productVariantId === line.productVariantId,
        );
        if (!sourceItem)
            throw new BusinessRuleError(
                'Sumber item invoice tidak cocok dengan SO.',
            );
        return {
            ...line,
            name: sourceItem.productVariant.name,
            unit: sourceItem.productVariant.primaryUnit,
            availableQuantity: active
                ? '0'
                : new Prisma.Decimal(line.quantity).minus(used).toString(),
            activeAdjustment: active,
            netUnitPrice: new Prisma.Decimal(line.netAmount)
                .div(line.quantity)
                .toFixed(6),
        };
    });
    const snapshot = readInvoiceSnapshot(invoice.commercialSnapshot);
    if (snapshot && (
        snapshot.items.length !== lines.length ||
        lines.some((line) => !snapshot.items.some((item) =>
            sameOriginalLine(line, { ...item, quantity: String(item.quantity) }),
        ))
    ))
        throw new BusinessRuleError(
            'Bukti snapshot komersial tidak cocok dengan item invoice.',
        );
    const variants = new Map<string, InvoiceItemForRevenue['variant']>(
        snapshot
            ? snapshot.items.map((item) => [item.sourceItemId, {
                id: item.productVariantId,
                name: item.name,
                skuCode: item.skuCode,
                revenueAccountId: item.revenueAccountId,
                product: item.product,
            }])
            : invoice.salesOrder.items.map((item) => [item.id, item.productVariant]),
    );
    const revenueByItem = await resolveItemRevenueAccounts(tx, lines, variants, revenue.id);
    const revenueIds = [...new Set(revenueByItem.values())];
    const accountIds = [...new Set([
        ar.id, vat.id, revenue.id, ...revenueIds,
        ...(roundingAccount ? [roundingAccount.id] : []),
    ])];
    if (
        (await tx.account.count({ where: { id: { in: accountIds }, isActive: true } })) !== accountIds.length ||
        (await tx.account.count({ where: { id: { in: revenueIds }, isActive: true, type: 'REVENUE' } })) !== revenueIds.length
    )
        throw new BusinessRuleError(
            'Akun pendapatan/penyesuaian belum valid atau tidak aktif.',
        );
    if (
        !journalMatchesPriceAdjustmentSource({
            totalAmount: invoice.totalAmount,
            taxAmount: tax,
            roundingAmount: new Prisma.Decimal(invoice.roundingAmount ?? 0),
            accountsReceivableAccountId: ar.id,
            vatAccountId: vat.id,
            defaultRevenueAccountId: revenue.id,
            roundingAccountId: roundingAccount?.id ?? null,
            items: lines.map((line) => ({
                sourceItemId: line.sourceItemId,
                netAmount: line.netAmount,
                revenueAccountId: revenueByItem.get(line.sourceItemId)!,
            })),
            journalLines: journal.lines,
        })
    )
        throw new BusinessRuleError(
            'Jurnal invoice tidak cocok dengan pemetaan akun pendapatan asal. Rekonsiliasi dahulu.',
        );
    const itemRevenue = (sourceItemId: string) => revenueByItem.get(sourceItemId)!;
    const itemsWithAccounts = items.map((item) => ({
        ...item,
        revenueAccountId: itemRevenue(item.sourceItemId),
    }));
    const originalLinesWithAccounts = lines.map((line) => ({
        ...line,
        revenueAccountId: itemRevenue(line.sourceItemId),
    }));
    const fingerprint = createHash('sha256')
        .update(
            JSON.stringify({
                invoice: {
                    id: invoice.id,
                    total: invoice.totalAmount,
                    paid: invoice.paidAmount,
                    credited: invoice.creditedAmount,
                    adjustment: invoice.priceAdjustmentAmount,
                    status: invoice.status,
                    customer: invoice.salesOrder.customerId,
                },
                journal,
                items: itemsWithAccounts,
                credits,
                existing,
            }),
        )
        .digest('hex');
    return {
        invoice,
        sourceJournalId: journal.id,
        items: itemsWithAccounts,
        originalLines: originalLinesWithAccounts,
        sourceLabel,
        fingerprint,
        accounts: { ar: ar.id, vat: vat.id, revenue: revenue.id },
        journalTax: tax,
    };
}
