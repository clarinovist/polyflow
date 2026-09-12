import { prisma } from '@/lib/core/prisma';
import { logActivity } from '@/lib/tools/audit';
import { addDays } from 'date-fns';
import {
    PurchaseInvoiceStatus,
    Prisma,
    NotificationType,
} from '@prisma/client';
import { CreatePurchaseInvoiceValues } from '@/lib/schemas/purchasing';
import { AutoJournalService } from '../finance/auto-journal-service';
import { logger } from '@/lib/config/logger';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';
import {
    clampPurchasingPage,
    createPurchasingPage,
    getWibBusinessDayStart,
    normalizePurchasingPagination,
    type PurchasingPage,
    type PurchasingPaginationInput,
    type PurchasingSortDirection,
} from '@/lib/purchasing/paged-list';
import {
    resolvePurchaseBillJournalAccounts,
    syncPurchaseBillAndJournal,
} from './finance/purchase-bill-journal-sync';

/**
 * Calculate invoice total from actual GR received quantities (not PO ordered qty).
 * Sum of (receivedQty × unitPrice × discount × PPN) per PO item + flat shipping.
 * Fallback to po.totalAmount when no GR exists yet.
 */
export async function calculatePoInvoiceTotalFromReceipts(
    purchaseOrderId: string,
    options?: {
        tx?: Prisma.TransactionClient;
        fallbackToPoTotal?: boolean;
    },
): Promise<number> {
    const db = options?.tx ?? prisma;
    const po = await db.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        select: {
            totalAmount: true,
            shippingCost: true,
            items: {
                select: {
                    id: true,
                    productVariantId: true,
                    quantity: true,
                    unitPrice: true,
                    discountPercent: true,
                    taxPercent: true,
                    ppnMode: true,
                },
            },
            goodsReceipts: {
                select: {
                    items: {
                        select: {
                            productVariantId: true,
                            purchaseOrderItemId: true,
                            receivedQty: true,
                        },
                    },
                },
            },
        },
    });

    if (!po) return 0;
    const poTotal =
        typeof po.totalAmount?.toNumber === 'function'
            ? po.totalAmount.toNumber()
            : Number(po.totalAmount) || 0;
    if (po.goodsReceipts.length === 0) {
        return options?.fallbackToPoTotal === false ? 0 : poTotal;
    }

    // Attribute receivedQty per purchaseOrderItemId. GR items carrying an
    // explicit purchaseOrderItemId count toward that row only; unattributed
    // GR items fall into a per-variant pool distributed proportionally to
    // each row's ordered quantity (zero-safe). This keeps repeated-SKU rows
    // with distinct prices/taxes exact instead of double-counting one
    // combined quantity against every row.
    const receivedByPoItem = new Map<string, number>();
    const poolByVariant = new Map<string, number>();
    for (const gr of po.goodsReceipts) {
        for (const item of gr.items) {
            const qty =
                typeof item.receivedQty?.toNumber === 'function'
                    ? item.receivedQty.toNumber()
                    : Number(item.receivedQty);
            if (item.purchaseOrderItemId) {
                receivedByPoItem.set(
                    item.purchaseOrderItemId,
                    (receivedByPoItem.get(item.purchaseOrderItemId) ?? 0) +
                        qty,
                );
            } else {
                poolByVariant.set(
                    item.productVariantId,
                    (poolByVariant.get(item.productVariantId) ?? 0) + qty,
                );
            }
        }
    }
    const orderedByVariant = new Map<string, number>();
    for (const poItem of po.items) {
        const ordered =
            typeof poItem.quantity?.toNumber === 'function'
                ? poItem.quantity.toNumber()
                : Number(poItem.quantity);
        orderedByVariant.set(
            poItem.productVariantId,
            (orderedByVariant.get(poItem.productVariantId) ?? 0) + ordered,
        );
    }

    let total = 0;
    for (const poItem of po.items) {
        const direct = receivedByPoItem.get(poItem.id) ?? 0;
        const pool = poolByVariant.get(poItem.productVariantId) ?? 0;
        const orderedTotal = orderedByVariant.get(poItem.productVariantId) ?? 0;
        const ordered =
            typeof poItem.quantity?.toNumber === 'function'
                ? poItem.quantity.toNumber()
                : Number(poItem.quantity);
        const poolShare =
            pool > 0 && orderedTotal > 0 ? (pool * ordered) / orderedTotal : 0;
        const received = direct + poolShare;
        const raw =
            received *
            (typeof poItem.unitPrice?.toNumber === 'function'
                ? poItem.unitPrice.toNumber()
                : Number(poItem.unitPrice));
        const discPct =
            typeof poItem.discountPercent?.toNumber === 'function'
                ? poItem.discountPercent.toNumber()
                : Number(poItem.discountPercent) || 0;
        const discount = raw * (discPct / 100);
        const afterDiscount = raw - discount;
        const taxPct =
            typeof poItem.taxPercent?.toNumber === 'function'
                ? poItem.taxPercent.toNumber()
                : Number(poItem.taxPercent) || 0;
        const ppnRes = calculatePpn(
            afterDiscount,
            taxPct,
            poItem.ppnMode as PpnMode,
        );
        total += ppnRes.total;
    }

    // Add flat shipping cost once
    const shipCost =
        typeof po.shippingCost?.toNumber === 'function'
            ? po.shippingCost.toNumber()
            : Number(po.shippingCost) || 0;
    total += shipCost;

    return Math.round(total * 100) / 100;
}

export async function createInvoice(data: CreatePurchaseInvoiceValues) {
    // Priority: manualDueDate > dueDate > invoiceDate + termDays. Default 30 hari.
    const termDays = data.termOfPaymentDays ?? 30;
    let finalDueDate: Date;
    if (data.manualDueDate) {
        finalDueDate = data.manualDueDate;
    } else if (data.dueDate) {
        finalDueDate = data.dueDate;
    } else {
        finalDueDate = addDays(data.invoiceDate, termDays);
    }

    const po = await prisma.purchaseOrder.findUnique({
        where: { id: data.purchaseOrderId },
        select: { totalAmount: true },
    });

    if (!po) throw new NotFoundError('Purchase Order', data.purchaseOrderId);

    // Calculate total from GR received qty (fallback to PO total if no GR yet)
    const calculatedTotal = await calculatePoInvoiceTotalFromReceipts(
        data.purchaseOrderId,
    );

    const invoice = await prisma.purchaseInvoice.create({
        data: {
            invoiceNumber: data.invoiceNumber,
            purchaseOrderId: data.purchaseOrderId,
            invoiceDate: data.invoiceDate,
            dueDate: finalDueDate,
            termOfPaymentDays: termDays,
            totalAmount: calculatedTotal,
            status: PurchaseInvoiceStatus.UNPAID,
        },
    });

    // Auto-Journaling Trigger
    await AutoJournalService.handlePurchaseInvoiceCreated(invoice.id).catch(
        (err) => {
            logger.error('Auto-Journal failed for purchase invoice', {
                error: err,
                module: 'PurchasingInvoicesService',
            });
        },
    );

    return invoice;
}

export async function recordPayment(
    id: string,
    amount: number,
    userId: string,
    options?: {
        paymentDate?: Date;
        method?: string;
        notes?: string;
        referenceNumber?: string | null;
        destinationBank?: string | null;
    },
) {
    const paymentAmount = new Prisma.Decimal(amount);
    if (
        !paymentAmount.isFinite() ||
        !paymentAmount.gt(0) ||
        paymentAmount.decimalPlaces() > 2 ||
        paymentAmount.gt('9999999999999.99')
    ) {
        throw new BusinessRuleError(
            'Payment amount must be positive, finite, at most two decimal places, and within the supported limit.',
            { amount },
            'PURCHASE_PAYMENT_INVALID_AMOUNT',
        );
    }

        const { getNextSequence, retryOnPaymentNumberConflict } =
            await import('@/lib/utils/sequence');

        return await retryOnPaymentNumberConflict(() =>
            prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id = ${id} FOR UPDATE`;
                const invoice = await tx.purchaseInvoice.findUnique({
                    where: { id },
                });
                if (!invoice) throw new NotFoundError('Purchase Invoice', id);

                // Prevent payment on already paid invoices
                if (invoice.status === PurchaseInvoiceStatus.PAID) {
                    throw new BusinessRuleError(
                        'Invoice is already fully paid.',
                        { invoiceId: id, status: invoice.status },
                        'ALREADY_PAID',
                    );
                }

                // Prevent payment on DRAFT invoices (walk-in awaiting Finance approval)
                if (invoice.status === PurchaseInvoiceStatus.DRAFT) {
                    throw new BusinessRuleError(
                        'Invoice masih DRAFT. Finance harus approve terlebih dahulu.',
                        { invoiceId: id, status: invoice.status },
                        'INVOICE_DRAFT',
                    );
                }

                // Validate payment amount does not exceed remaining balance
                const remainingBalance =
                    invoice.totalAmount.toNumber() -
                    invoice.paidAmount.toNumber();
                if (amount > remainingBalance) {
                    throw new BusinessRuleError(
                        `Payment amount (${amount}) exceeds remaining balance (${remainingBalance})`,
                        { amount, remainingBalance, invoiceId: id },
                        'PAYMENT_EXCEEDS_BALANCE',
                    );
                }

                const { normalizePaymentMethodFields } =
                    await import('@/lib/finance/payment-methods');
                const { getPaymentBanksSetting } =
                    await import('@/services/settings/app-settings-service');

                const banks = await getPaymentBanksSetting();
                const paymentFields = normalizePaymentMethodFields(
                    {
                        method: options?.method || 'Transfer BCA',
                        referenceNumber: options?.referenceNumber,
                        destinationBank: options?.destinationBank,
                    },
                    banks,
                );

                const newPaidAmount = invoice.paidAmount.toNumber() + amount;
                let status: PurchaseInvoiceStatus =
                    PurchaseInvoiceStatus.PARTIAL;

                if (newPaidAmount >= invoice.totalAmount.toNumber()) {
                    status = PurchaseInvoiceStatus.PAID;
                }

                // Nomor dialokasikan DI DALAM transaksi (bukan sebelumnya) dan
                // seluruh transaksi di-retry pada P2002 paymentNumber — race
                // atomic sequence + counter tertinggal (backfill SQL) tetap
                // menyelamatkan pembayaran tanpa gagal di sisi user.
                const paymentNumber = await getNextSequence('PAYMENT_OUT');

                const payment = await tx.payment.create({
                    data: {
                        purchaseInvoiceId: id,
                        paymentNumber,
                        amount,
                        paymentDate: options?.paymentDate || new Date(),
                        method: paymentFields.method,
                        notes: options?.notes,
                        referenceNumber: paymentFields.referenceNumber,
                        destinationBank: paymentFields.destinationBank,
                    },
                });

                const updated = await tx.purchaseInvoice.update({
                    where: { id },
                    data: {
                        paidAmount: newPaidAmount,
                        status,
                    },
                });

                await logActivity({
                    userId,
                    action: 'PAYMENT_PURCHASE',
                    entityType: 'PurchaseInvoice',
                    entityId: id,
                    details: `Recorded payment of ${amount} for Invoice ${invoice.invoiceNumber}.New Status: ${status} `,
                    tx,
                });

                return {
                    ...updated,
                    paymentId: payment.id,
                };
            }),
        );
}

export async function getPurchaseInvoiceById(id: string) {
    return await prisma.purchaseInvoice.findUnique({
        where: { id },
        include: {
            purchaseOrder: {
                select: {
                    id: true,
                    orderNumber: true,
                    totalAmount: true,
                    supplier: { select: { name: true, code: true } },
                    items: {
                        select: {
                            id: true,
                            quantity: true,
                            unitPrice: true,
                            subtotal: true,
                            discountPercent: true,
                            taxPercent: true,
                            taxAmount: true,
                            productVariant: {
                                select: {
                                    id: true,
                                    name: true,
                                    skuCode: true,
                                    primaryUnit: true,
                                },
                            },
                        },
                        orderBy: { id: 'asc' },
                    },
                },
            },
            payments: {
                orderBy: { paymentDate: 'desc' },
            },
        },
    });
}

const purchaseInvoiceListInclude = {
    purchaseOrder: {
        select: {
            id: true,
            orderNumber: true,
            supplier: { select: { name: true } },
        },
    },
} satisfies Prisma.PurchaseInvoiceInclude;

type PurchaseInvoiceListItem = Prisma.PurchaseInvoiceGetPayload<{
    include: typeof purchaseInvoiceListInclude;
}>;

export const PURCHASE_INVOICE_SORTS = [
    'invoiceDate',
    'supplier',
    'status',
    'totalAmount',
    'dueDate',
] as const;
export type PurchaseInvoiceSort = (typeof PURCHASE_INVOICE_SORTS)[number];

export interface PurchaseInvoicePageInput extends PurchasingPaginationInput {
    search?: string;
    status?: PurchaseInvoiceStatus | PurchaseInvoiceStatus[];
    overdue?: boolean;
    startDate?: Date;
    endDate?: Date;
    now?: Date;
    sort?: PurchaseInvoiceSort;
    direction?: PurchasingSortDirection;
}

function getPurchaseInvoiceOrderBy(
    sort: PurchaseInvoiceSort = 'invoiceDate',
    direction: PurchasingSortDirection = 'desc',
): Prisma.PurchaseInvoiceOrderByWithRelationInput[] {
    const primary: Prisma.PurchaseInvoiceOrderByWithRelationInput =
        sort === 'supplier'
            ? { purchaseOrder: { supplier: { name: direction } } }
            : { [sort]: direction };

    return [primary, { id: direction }];
}

function buildPurchaseInvoiceWhere(
    filters: Omit<PurchaseInvoicePageInput, 'page' | 'pageSize'> = {},
): Prisma.PurchaseInvoiceWhereInput {
    const search = filters.search?.trim();
    const status = filters.overdue
        ? {
              in: [
                  PurchaseInvoiceStatus.UNPAID,
                  PurchaseInvoiceStatus.PARTIAL,
                  PurchaseInvoiceStatus.OVERDUE,
              ],
          }
        : filters.status
          ? Array.isArray(filters.status)
              ? { in: filters.status }
              : filters.status
          : undefined;

    return {
        ...(status ? { status } : {}),
        ...(filters.startDate || filters.endDate
            ? {
                  invoiceDate: {
                      ...(filters.startDate ? { gte: filters.startDate } : {}),
                      ...(filters.endDate ? { lte: filters.endDate } : {}),
                  },
              }
            : {}),
        ...(filters.overdue
            ? {
                  dueDate: { lt: getWibBusinessDayStart(filters.now) },
                  paidAmount: { lt: prisma.purchaseInvoice.fields.totalAmount },
              }
            : {}),
        ...(search
            ? {
                  OR: [
                      {
                          invoiceNumber: {
                              contains: search,
                              mode: Prisma.QueryMode.insensitive,
                          },
                      },
                      {
                          purchaseOrder: {
                              is: {
                                  orderNumber: {
                                      contains: search,
                                      mode: Prisma.QueryMode.insensitive,
                                  },
                              },
                          },
                      },
                      {
                          purchaseOrder: {
                              is: {
                                  supplier: {
                                      is: {
                                          name: {
                                              contains: search,
                                              mode: Prisma.QueryMode.insensitive,
                                          },
                                      },
                                  },
                              },
                          },
                      },
                  ],
              }
            : {}),
    };
}

export async function getPurchaseInvoices(dateRange?: {
    startDate?: Date;
    endDate?: Date;
}) {
    const where: Prisma.PurchaseInvoiceWhereInput = {};
    if (dateRange?.startDate && dateRange.endDate) {
        where.invoiceDate = {
            gte: dateRange.startDate,
            lte: dateRange.endDate,
        };
    }

    return await prisma.purchaseInvoice.findMany({
        where,
        include: purchaseInvoiceListInclude,
        orderBy: { createdAt: 'desc' },
    });
}

export async function getPurchaseInvoicesPage(
    filters: PurchaseInvoicePageInput = {},
): Promise<PurchasingPage<PurchaseInvoiceListItem>> {
    const pagination = normalizePurchasingPagination(filters);
    const where = buildPurchaseInvoiceWhere(filters);
    const totalCount = await prisma.purchaseInvoice.count({ where });
    const page = clampPurchasingPage(
        pagination.page,
        totalCount,
        pagination.pageSize,
    );
    const items = await prisma.purchaseInvoice.findMany({
        where,
        include: purchaseInvoiceListInclude,
        orderBy: getPurchaseInvoiceOrderBy(filters.sort, filters.direction),
        skip: (page - 1) * pagination.pageSize,
        take: pagination.pageSize,
    });

    return createPurchasingPage(
        items,
        totalCount,
        page,
        pagination.pageSize,
    );
}

/**
 * Purchase invoices eligible for supplier payment recording.
 *
 * Source of truth: outstanding balance (totalAmount - paidAmount) > 0.
 * Includes UNPAID, PARTIAL, OVERDUE, and any non-cancelled invoice that still
 * has a remaining balance (e.g. DRAFT bills that were never flipped to UNPAID).
 * Excludes CANCELLED. Fully settled invoices (outstanding = 0) are excluded
 * regardless of status.
 */
export async function getOutstandingPurchaseInvoices() {
    const { toDecimalNumber } = await import('@/lib/utils/utils');

    const invoices = await prisma.purchaseInvoice.findMany({
        where: {
            status: { not: PurchaseInvoiceStatus.CANCELLED },
        },
        select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            invoiceDate: true,
            dueDate: true,
            termOfPaymentDays: true,
            purchaseOrder: {
                select: {
                    orderNumber: true,
                    supplier: { select: { name: true } },
                },
            },
        },
        orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
    });

    return invoices.filter((inv) => {
        const outstanding =
            toDecimalNumber(inv.totalAmount) - toDecimalNumber(inv.paidAmount);
        return outstanding > 0;
    });
}

export async function generateBillNumber(
    tx?: Prisma.TransactionClient,
): Promise<string> {
    const db = tx ?? prisma;
    // Held until the new bill commits, including concurrent different-PO receipts.
    if (tx) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('purchase-bill-number'))`;
    const dateStr = new Date().getFullYear().toString();
    const prefix = `BILL - ${dateStr} -`;

    const lastBill = await db.purchaseInvoice.findFirst({
        where: { invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
    });

    let nextSequence = 1;
    if (lastBill) {
        const parts = lastBill.invoiceNumber.split('-');
        const lastSeq = parseInt(parts[2]);
        if (!isNaN(lastSeq)) {
            nextSequence = lastSeq + 1;
        }
    }

    return `${prefix}${nextSequence.toString().padStart(4, '0')} `;
}

function isProtectedPurchaseBill(bill: {
    status: PurchaseInvoiceStatus;
    paidAmount: Prisma.Decimal;
}): boolean {
    const paidAmount =
        bill.paidAmount instanceof Prisma.Decimal
            ? bill.paidAmount
            : new Prisma.Decimal(
                  typeof (bill.paidAmount as { toNumber?: () => number })
                      ?.toNumber === 'function'
                      ? (
                          bill.paidAmount as unknown as {
                              toNumber: () => number;
                          }
                      ).toNumber()
                      : 0,
              );
    return (
        paidAmount.gt(0) ||
        bill.status === PurchaseInvoiceStatus.PAID ||
        bill.status === PurchaseInvoiceStatus.PARTIAL ||
        bill.status === PurchaseInvoiceStatus.OVERDUE
    );
}

export async function createDraftBillFromPo(
    purchaseOrderId: string,
    userId: string,
    options?: { tx?: Prisma.TransactionClient },
) {
    const run = async (tx: Prisma.TransactionClient) => {
        await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${purchaseOrderId} FOR UPDATE`;
        const po = await tx.purchaseOrder.findUnique({
            where: { id: purchaseOrderId },
            select: {
                totalAmount: true,
                taxAmount: true,
                orderNumber: true,
                status: true,
                supplier: { select: { paymentTermDays: true } },
                entrySource: true,
            },
        });
        if (!po || !po.totalAmount) return;

        await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE "purchaseOrderId" = ${purchaseOrderId} AND status <> 'CANCELLED' FOR UPDATE`;
        const existingBills = await tx.purchaseInvoice.findMany({
            where: {
                purchaseOrderId,
                status: { not: PurchaseInvoiceStatus.CANCELLED },
            },
            orderBy: { createdAt: 'asc' },
        });
        const calculatedTotal = await calculatePoInvoiceTotalFromReceipts(
            purchaseOrderId, { tx, fallbackToPoTotal: existingBills.length === 0 },
        );
        if (existingBills.length > 1) {
            const protectedBills = existingBills.filter(isProtectedPurchaseBill);
            const original = protectedBills.length === 1 ? protectedBills[0] : undefined;
            const supplementary = original
                ? existingBills.find((bill) => bill.id !== original.id)
                : undefined;
            const isRecognizedSupplementary = Boolean(
                existingBills.length === 2 &&
                    original &&
                    supplementary &&
                    supplementary.status === PurchaseInvoiceStatus.DRAFT &&
                    new Prisma.Decimal(supplementary.paidAmount).isZero() &&
                    supplementary.notes?.startsWith(
                        `Suplementer: tambahan GR setelah ${original.invoiceNumber}`,
                    ) &&
                    new Prisma.Decimal(original.totalAmount)
                        .plus(supplementary.totalAmount)
                        .equals(calculatedTotal),
            );

            if (!isRecognizedSupplementary || !original || !supplementary) {
                throw new BusinessRuleError(
                    'Ditemukan lebih dari satu bill aktif untuk PO ini. Rekonsiliasi bill terlebih dahulu.',
                    {
                        purchaseOrderId,
                        invoiceIds: existingBills.map((invoice) => invoice.id),
                    },
                    'PURCHASE_BILL_AMBIGUOUS',
                );
            }

            const accounts = await resolvePurchaseBillJournalAccounts();
            await syncPurchaseBillAndJournal(tx, {
                invoiceId: supplementary.id,
                targetTotal: new Prisma.Decimal(supplementary.totalAmount),
                poTotal: new Prisma.Decimal(po.totalAmount),
                poTax: new Prisma.Decimal(po.taxAmount ?? 0),
                userId,
                accounts,
            });
            return original;
        }
        const existing = existingBills[0];
        const isProtected = existing
            ? isProtectedPurchaseBill(existing)
            : false;
        const billTotal = isProtected
            ? new Prisma.Decimal(calculatedTotal).minus(existing.totalAmount).toNumber()
            : calculatedTotal;
        if (isProtected && billTotal === 0) return existing;
        if (isProtected && billTotal < 0) {
            throw new BusinessRuleError('Bill sudah dibayar sebagian/seluruhnya. Koreksi penerimaan memerlukan penyesuaian finance.', { invoiceId: existing.id }, 'PURCHASE_BILL_PROTECTED');
        }
        const accounts = await resolvePurchaseBillJournalAccounts();

        if (existing && !isProtected) {
            const synced = await syncPurchaseBillAndJournal(tx, {
                invoiceId: existing.id,
                targetTotal: new Prisma.Decimal(calculatedTotal),
                poTotal: new Prisma.Decimal(po.totalAmount),
                poTax: new Prisma.Decimal(po.taxAmount ?? 0),
                userId,
                accounts,
            });
            return synced.invoice;
        }

        const rawTerm = po.supplier?.paymentTermDays;
        const termOfPaymentDays =
            rawTerm != null && rawTerm >= 0 && rawTerm <= 365 ? rawTerm : 30;
        const invoiceNumber = await generateBillNumber(tx);
        const invoiceDate = new Date();
        const dueDate = addDays(invoiceDate, termOfPaymentDays);
        const isWalkIn =
            po.status === 'RECEIVED' || po.status === 'PARTIAL_RECEIVED';
        const status =
            isProtected || isWalkIn && po.entrySource === 'WALK_IN_RECEIPT'
                ? PurchaseInvoiceStatus.DRAFT
                : isWalkIn
                  ? PurchaseInvoiceStatus.UNPAID
                  : PurchaseInvoiceStatus.DRAFT;

        const invoice = await tx.purchaseInvoice.create({
            data: {
                invoiceNumber,
                purchaseOrderId,
                invoiceDate,
                dueDate,
                termOfPaymentDays,
                totalAmount: billTotal,
                status,
                notes: isProtected
                    ? `Suplementer: tambahan GR setelah ${existing.invoiceNumber} (sisa ${billTotal}) — PO ${po.orderNumber}`
                    : `System generated bill for PO ${po.orderNumber} (based on GR received quantities)`,
            },
        });

        const synced = await syncPurchaseBillAndJournal(tx, {
            invoiceId: invoice.id,
            targetTotal: new Prisma.Decimal(billTotal),
            poTotal: new Prisma.Decimal(po.totalAmount),
            poTax: new Prisma.Decimal(po.taxAmount ?? 0),
            userId,
            accounts,
        });
        return synced.invoice;
    };

    return options?.tx
        ? run(options.tx)
        : prisma.$transaction(run, {
              // Row locks serialize PO/bill changes; each read after waiting must
              // see the latest commit rather than a stale serializable snapshot.
              isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          });
}

export async function updatePurchaseInvoiceDueDate(
    id: string,
    data: { dueDate?: Date; termOfPaymentDays?: number; invoiceDate?: Date },
    userId: string,
) {
    const existing = await prisma.purchaseInvoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Purchase Invoice', id);

    if (existing.status === PurchaseInvoiceStatus.PAID) {
        throw new BusinessRuleError(
            'Tidak dapat mengubah tanggal jatuh tempo invoice yang sudah LUNAS',
        );
    }

    let finalDueDate = data.dueDate;
    if (!finalDueDate) {
        const invDate = data.invoiceDate ?? existing.invoiceDate;
        const term = data.termOfPaymentDays ?? existing.termOfPaymentDays;
        finalDueDate = addDays(invDate, term);
    }

    const updated = await prisma.purchaseInvoice.update({
        where: { id },
        data: {
            ...(data.invoiceDate && { invoiceDate: data.invoiceDate }),
            dueDate: finalDueDate,
            ...(data.termOfPaymentDays != null && {
                termOfPaymentDays: data.termOfPaymentDays,
            }),
        },
    });

    await logActivity({
        userId,
        action: 'UPDATE_PURCHASE_INVOICE_DUE_DATE',
        entityType: 'PurchaseInvoice',
        entityId: id,
        details: `Due date changed to ${finalDueDate.toISOString()} term ${updated.termOfPaymentDays} days`,
    });

    return updated;
}

export async function checkOverduePurchasingInvoices(now: Date = new Date()) {
    const { NotificationService } =
        await import('@/services/core/notification-service');
    const overdueInvoices = await prisma.purchaseInvoice.findMany({
        where: {
            dueDate: { lt: getWibBusinessDayStart(now) },
            status: {
                in: [
                    PurchaseInvoiceStatus.UNPAID,
                    PurchaseInvoiceStatus.PARTIAL,
                ],
            },
        },
        include: { purchaseOrder: { select: { orderNumber: true } } },
    });

    if (overdueInvoices.length === 0) return;

    const targetUsers = await prisma.user.findMany({
        where: { role: 'ADMIN' },
        select: { id: true },
    });

    if (targetUsers.length > 0) {
        const inputs = overdueInvoices
            .map((inv) => {
                return targetUsers.map((u) => ({
                    userId: u.id,
                    type: 'OVERDUE_AP' as NotificationType,
                    title: 'Overdue Purchase Invoice',
                    message: `Invoice ${inv.invoiceNumber} (PO ${inv.purchaseOrder.orderNumber}) is overdue since ${inv.dueDate?.toLocaleDateString() || 'Unknown'}. amount due: ${inv.totalAmount.toNumber() - inv.paidAmount.toNumber()}`,
                    link: `/admin/purchasing/invoices/${inv.id}`,
                    entityType: 'PurchaseInvoice',
                    entityId: inv.id,
                }));
            })
            .flat();

        await NotificationService.createBulkNotificationsThrottled(inputs);
    }
}
