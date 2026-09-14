import { JournalStatus, ReferenceType, Prisma } from '@prisma/client';

import { prisma, getTenantIdFromContext } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { AccountingService } from '../accounting/accounting-service';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { resolveRevenueAccount } from '@/services/accounting/revenue-account-resolver';
import { loadActiveTenantRevenueRules } from '@/services/accounting/tenant-revenue-rule-service';
import type { RevenueRule } from '@/services/accounting/tenant-revenue-rule-service';

/**
 * Load active tenant revenue rules from the main DB, once per invoice.
 * Fail-safe: loader errors log a warning and fall back to the default
 * semantic role (`sales-revenue`) — never a guessed account.
 */
async function loadRulesForInvoice(
    invoiceId: string,
    tenantId: string | undefined,
): Promise<RevenueRule[]> {
    try {
        return await loadActiveTenantRevenueRules(tenantId);
    } catch {
        const { logger } = await import('@/lib/config/logger');
        logger.warn(
            'Revenue rule loader failed; falling back to default role',
            {
                module: 'auto-journal-invoice-handlers',
                invoiceId,
                tenantId,
            },
        );
        return [];
    }
}

export async function handleSalesInvoiceCreated(
    invoiceId: string,
    options?: {
        journalDate?: Date;
        tx?: Prisma.TransactionClient;
        refreshDraft?: boolean;
    },
) {
    const db = options?.tx ?? prisma;
    const invoice = await db.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            salesOrder: {
                include: {
                    items: {
                        include: {
                            productVariant: {
                                include: {
                                    product: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!invoice) throw new NotFoundError('Invoice', invoiceId);

    // Idempotency guard: creation-time call sites invoke this handler
    // post-commit with swallowed errors, so a retry (repair/backfill) must not
    // duplicate an existing journal. VOIDED journals don't count — the source
    // invoice was cancelled and a fresh document state deserves a fresh check.
    const existing = await db.journalEntry.findFirst({
        where: {
            referenceType: ReferenceType.SALES_INVOICE,
            referenceId: invoiceId,
            status: { not: JournalStatus.VOIDED },
        },
        select: { id: true, status: true },
    });
    if (existing && !options?.refreshDraft) return;
    if (
        options?.refreshDraft &&
        (!options.tx ||
            invoice.status !== 'DRAFT' ||
            (existing && existing.status !== JournalStatus.DRAFT))
    ) {
        throw new BusinessRuleError(
            'Jurnal invoice yang sudah diakui tidak dapat dihitung ulang.',
        );
    }
    if (existing) {
        // The caller locks the invoice; guard against concurrent GL posting as well.
        const replaced = await db.journalEntry.updateMany({
            where: { id: existing.id, status: 'DRAFT' },
            data: { status: 'VOIDED' },
        });
        if (replaced.count !== 1)
            throw new BusinessRuleError(
                'Status jurnal berubah. Muat ulang sebelum sinkronisasi invoice.',
            );
    }

    const arAccount = await resolveAccount('accounts-receivable');
    const vatAccount = await resolveAccount('vat-output');

    const totalAmount = Number(invoice.totalAmount);
    const roundingAmount = Number(invoice.roundingAmount ?? 0);
    const commercialTotal = new Prisma.Decimal(totalAmount)
        .minus(roundingAmount)
        .toNumber();
    const soTotal = Number(invoice.salesOrder.totalAmount || 0);
    const soTax = Number(invoice.salesOrder.taxAmount || 0);

    let taxAmount = 0;
    if (soTotal > 0 && soTax > 0 && soTotal > soTax) {
        const taxRate = soTax / (soTotal - soTax);
        const netAmount = commercialTotal / (1 + taxRate);
        taxAmount = commercialTotal - netAmount;
        if (invoice.roundingAmount != null) {
            taxAmount = new Prisma.Decimal(taxAmount).toDecimalPlaces(2).toNumber();
        }
    }

    const subtotal = new Prisma.Decimal(commercialTotal)
        .minus(taxAmount)
        .toNumber();
    const journalStatus =
        invoice.status === 'DRAFT' ? JournalStatus.DRAFT : JournalStatus.POSTED;

    const items = invoice.salesOrder.items;
    const tenantId = getTenantIdFromContext();
    const rules = await loadRulesForInvoice(invoiceId, tenantId);
    const cacheKey = tenantId ?? 'default';

    // Default revenue (role) — resolved once when needed
    let defaultRevenueId: string | null = null;
    async function getDefaultRevenueId(): Promise<string> {
        if (defaultRevenueId) return defaultRevenueId;
        const acc = await resolveAccount('sales-revenue');
        defaultRevenueId = acc.id;
        return defaultRevenueId;
    }

    const revenueMap = new Map<
        string,
        { amount: number; description: string }
    >();

    if (items.length > 0) {
        for (const item of items) {
            // #gap-8: use deliveredQty (physical shipped) for revenue split when available,
            // fallback to ordered qty — so journal matches delivered-based invoice total.
            const deliveredRaw = (item as Record<string, unknown>)
                .deliveredQty as
                | { toNumber?: () => number }
                | number
                | null
                | undefined;
            let deliveredNum = NaN;
            if (deliveredRaw != null) {
                if (
                    typeof (deliveredRaw as { toNumber?: unknown }).toNumber ===
                    'function'
                ) {
                    deliveredNum = (
                        deliveredRaw as { toNumber: () => number }
                    ).toNumber();
                } else {
                    deliveredNum = Number(deliveredRaw);
                }
            }
            const quantity =
                !isNaN(deliveredNum) && deliveredNum > 0
                    ? deliveredNum
                    : Number(item.quantity);
            const unitPrice = Number(item.unitPrice);
            const lineSubtotal = quantity * unitPrice;

            const variant = item.productVariant;
            const resolved = await resolveRevenueAccount(
                {
                    quantity,
                    unitPrice,
                    variant: variant
                        ? {
                              id: variant.id,
                              name: variant.name,
                              skuCode: variant.skuCode,
                              revenueAccountId: variant.revenueAccountId,
                              product: variant.product
                                  ? {
                                        id: variant.product.id,
                                        name: variant.product.name,
                                        revenueAccountId:
                                            variant.product.revenueAccountId,
                                    }
                                  : null,
                          }
                        : null,
                },
                db,
                rules,
                cacheKey,
            );

            let revenueAccountId: string;
            let revenueSource: string;
            if (resolved) {
                revenueAccountId = resolved.accountId;
                revenueSource =
                    resolved.source === 'rule'
                        ? `rule:${resolved.accountCode}`
                        : `${resolved.source}:${resolved.accountCode}`;
            } else {
                revenueAccountId = await getDefaultRevenueId();
                revenueSource = 'default-role';
            }

            const existing = revenueMap.get(revenueAccountId);
            if (existing) {
                existing.amount += lineSubtotal;
            } else {
                revenueMap.set(revenueAccountId, {
                    amount: lineSubtotal,
                    description: `Revenue (${revenueSource})`,
                });
            }
        }
    } else {
        // Empty items: single default revenue credit (backward-compatible)
        const revenueAccountId = await getDefaultRevenueId();
        revenueMap.set(revenueAccountId, {
            amount: subtotal,
            description: 'Revenue',
        });
    }

    // New-policy invoices must balance at the persisted cent precision, even
    // with fractional prices across several revenue accounts.
    if (invoice.roundingAmount != null) {
        for (const value of revenueMap.values()) {
            value.amount = new Prisma.Decimal(value.amount).toDecimalPlaces(2).toNumber();
        }
    }
    // Scale credits to match subtotal (rounding / tax-base drift)
    const totalMapped = Array.from(revenueMap.values()).reduce(
        (s, v) => s + v.amount,
        0,
    );
    if (totalMapped !== subtotal && totalMapped > 0) {
        const largest = Array.from(revenueMap.entries()).reduce((a, b) =>
            b[1].amount > a[1].amount ? b : a,
        );
        largest[1].amount += subtotal - totalMapped;
    } else if (totalMapped === 0 && subtotal > 0) {
        // All zero-price lines — still post subtotal to default revenue
        const revenueAccountId = await getDefaultRevenueId();
        revenueMap.set(revenueAccountId, {
            amount: subtotal,
            description: 'Revenue (default-role)',
        });
    }

    const journalLines = [
        {
            accountId: arAccount.id,
            debit: totalAmount,
            credit: 0,
            description: `AR for ${invoice.invoiceNumber}`,
        },
        ...Array.from(revenueMap.entries()).map(
            ([accountId, { amount, description }]) => ({
                accountId,
                debit: 0,
                credit: amount,
                description: `${description} - ${invoice.invoiceNumber}`,
            }),
        ),
        ...(roundingAmount > 0
            ? [
                  {
                      accountId: (await resolveAccount('sales-rounding-income'))
                          .id,
                      debit: 0,
                      credit: roundingAmount,
                      description: `Pembulatan - ${invoice.invoiceNumber}`,
                  },
              ]
            : []),
        ...(taxAmount > 0
            ? [
                  {
                      accountId: vatAccount.id,
                      debit: 0,
                      credit: taxAmount,
                      description: `VAT Output for ${invoice.invoiceNumber}`,
                  },
              ]
            : []),
    ];

    await AccountingService.createJournalEntry(
        {
            // journalDate override: repair/backfill paths post into the CURRENT
            // open fiscal period instead of backdating into a closed one.
            entryDate: options?.journalDate ?? invoice.invoiceDate,
            description: `Sales Invoice #${invoice.invoiceNumber}`,
            reference: invoice.invoiceNumber,
            referenceType: ReferenceType.SALES_INVOICE,
            referenceId: invoice.id,
            isAutoGenerated: true,
            status: journalStatus,
            lines: journalLines,
        },
        options?.tx,
    );
}

export async function handlePurchaseInvoiceCreated(
    invoiceId: string,
    options?: { journalDate?: Date },
) {
    const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: { purchaseOrder: true },
    });

    if (!invoice) throw new NotFoundError('Purchase Invoice', invoiceId);

    // Idempotency guard (same rationale as the sales side): the service AND
    // some actions fire this handler for the same invoice — dedup keeps that
    // harmless instead of posting the VAT journal twice.
    const existing = await prisma.journalEntry.findFirst({
        where: {
            referenceType: ReferenceType.PURCHASE_INVOICE,
            referenceId: invoiceId,
            status: { not: JournalStatus.VOIDED },
        },
        select: { id: true },
    });
    if (existing) return;

    const totalAmount = Number(invoice.totalAmount);
    const poTotal = Number(invoice.purchaseOrder.totalAmount || 0);
    const poTax = Number(invoice.purchaseOrder.taxAmount || 0);

    let taxAmount = 0;
    if (poTotal > 0 && poTax > 0 && poTotal > poTax) {
        const taxRate = poTax / (poTotal - poTax);
        const netAmount = totalAmount / (1 + taxRate);
        // Round to cents — the float derivation picks up ~1e-11 noise, and the
        // journal lines must sum to totalAmount exactly.
        taxAmount = Math.round((totalAmount - netAmount) * 100) / 100;
    }
    const subtotal = totalAmount - taxAmount;

    // Full-amount AP booking (invoice-based model, matches rekap hutang):
    // Dr GR/IR clearing (membalik accrual saat barang diterima)
    // Dr PPN Masukan (bila ber-PPN)
    // Cr AP totalAmount
    const grClearingAccount = await resolveAccount('gr-clearing');
    const vatInputAccount = await resolveAccount('vat-input');
    const apAccount = await resolveAccount('accounts-payable');

    const journalStatus =
        invoice.status === 'DRAFT' ? JournalStatus.DRAFT : JournalStatus.POSTED;

    await AccountingService.createJournalEntry({
        // journalDate override: same repair rationale as the sales side.
        entryDate: options?.journalDate ?? invoice.invoiceDate,
        description: `Purchase Invoice #${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        referenceType: ReferenceType.PURCHASE_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true,
        status: journalStatus,
        lines: [
            {
                accountId: grClearingAccount.id,
                debit: subtotal,
                credit: 0,
                description: `GR/IR: ${invoice.invoiceNumber}`,
            },
            ...(taxAmount > 0
                ? [
                      {
                          accountId: vatInputAccount.id,
                          debit: taxAmount,
                          credit: 0,
                          description: `VAT Input for ${invoice.invoiceNumber}`,
                      },
                  ]
                : []),
            {
                accountId: apAccount.id,
                debit: 0,
                credit: totalAmount,
                description: `AP for ${invoice.invoiceNumber}`,
            },
        ],
    });
}
