import { JournalStatus, ReferenceType } from '@prisma/client';

import { prisma, getTenantIdFromContext } from '@/lib/core/prisma';
import { NotFoundError } from '@/lib/errors/errors';
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

export async function handleSalesInvoiceCreated(invoiceId: string) {
    const invoice = await prisma.invoice.findUnique({
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

    const arAccount = await resolveAccount('accounts-receivable');
    const vatAccount = await resolveAccount('vat-output');

    const totalAmount = Number(invoice.totalAmount);
    const soTotal = Number(invoice.salesOrder.totalAmount || 0);
    const soTax = Number(invoice.salesOrder.taxAmount || 0);

    let taxAmount = 0;
    if (soTotal > 0 && soTax > 0 && soTotal > soTax) {
        const taxRate = soTax / (soTotal - soTax);
        const netAmount = totalAmount / (1 + taxRate);
        taxAmount = totalAmount - netAmount;
    }

    const subtotal = totalAmount - taxAmount;
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
                prisma,
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

    // Scale credits to match subtotal (rounding / tax-base drift)
    const totalMapped = Array.from(revenueMap.values()).reduce(
        (s, v) => s + v.amount,
        0,
    );
    if (Math.abs(totalMapped - subtotal) > 0.01 && totalMapped > 0) {
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

    await AccountingService.createJournalEntry({
        entryDate: invoice.invoiceDate,
        description: `Sales Invoice #${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        referenceType: ReferenceType.SALES_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true,
        status: journalStatus,
        lines: journalLines,
    });
}

export async function handlePurchaseInvoiceCreated(invoiceId: string) {
    const invoice = await prisma.purchaseInvoice.findUnique({
        where: { id: invoiceId },
        include: { purchaseOrder: true },
    });

    if (!invoice) throw new NotFoundError('Purchase Invoice', invoiceId);

    const totalAmount = Number(invoice.totalAmount);
    const poTotal = Number(invoice.purchaseOrder.totalAmount || 0);
    const poTax = Number(invoice.purchaseOrder.taxAmount || 0);

    let taxAmount = 0;
    if (poTotal > 0 && poTax > 0 && poTotal > poTax) {
        const taxRate = poTax / (poTotal - poTax);
        const netAmount = totalAmount / (1 + taxRate);
        taxAmount = totalAmount - netAmount;
    }

    if (taxAmount <= 0) return;

    const vatInputAccount = await resolveAccount('vat-input');
    const apAccount = await resolveAccount('accounts-payable');

    const journalStatus =
        invoice.status === 'DRAFT' ? JournalStatus.DRAFT : JournalStatus.POSTED;

    await AccountingService.createJournalEntry({
        entryDate: invoice.invoiceDate,
        description: `Purchase Invoice #${invoice.invoiceNumber} - PPN Masukan`,
        reference: invoice.invoiceNumber,
        referenceType: ReferenceType.PURCHASE_INVOICE,
        referenceId: invoice.id,
        isAutoGenerated: true,
        status: journalStatus,
        lines: [
            {
                accountId: vatInputAccount.id,
                debit: taxAmount,
                credit: 0,
                description: `VAT Input for ${invoice.invoiceNumber}`,
            },
            {
                accountId: apAccount.id,
                debit: 0,
                credit: taxAmount,
                description: `AP for ${invoice.invoiceNumber} PPN`,
            },
        ],
    });
}
