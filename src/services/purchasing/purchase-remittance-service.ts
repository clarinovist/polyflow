import { prisma } from '@/lib/core/prisma';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { logger } from '@/lib/config/logger';

// ── Types ──────────────────────────────────────────────────────────

export interface PurchaseRemittanceItemInput {
    purchaseInvoiceId: string;
    amount: number;
    method: string;
    referenceNumber?: string;
    proofUrl?: string;
    proofStorageKey?: string;
    proofOriginalName?: string;
    proofMimeType?: string;
    proofSizeBytes?: number;
}

export interface CreatePurchaseRemittanceInput {
    userId: string;
    paidAt: Date;
    items: PurchaseRemittanceItemInput[];
    notes?: string;
}

export interface VerifyPurchaseRemittanceItemResult {
    itemId: string;
    purchaseInvoiceId: string;
    success: boolean;
    paymentId?: string;
    error?: string;
}

export interface VerifyPurchaseRemittanceResult {
    remittanceId: string;
    remittanceNumber: string;
    successCount: number;
    failedCount: number;
    items: VerifyPurchaseRemittanceItemResult[];
}

// ── Number generator ───────────────────────────────────────────────
// Pattern: mirror remittance-service (sales) — prefix per period + counter.
// PREM-{year}-{MM}-{counter 4 pad} monthly bucket, distinct prefix from
// sales' REM- so numbers stay visually distinguishable even though the
// tables are separate (no collision risk either way).

export async function generatePurchaseRemittanceNumber(
    now: Date = new Date(),
): Promise<string> {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `PREM-${year}-${month}-`;

    const last = await prisma.purchaseRemittance.findFirst({
        where: { remittanceNumber: { startsWith: prefix } },
        orderBy: { remittanceNumber: 'desc' },
        select: { remittanceNumber: true },
    });

    let next = 1;
    if (last?.remittanceNumber) {
        const numPart = parseInt(last.remittanceNumber.replace(prefix, ''), 10);
        if (!Number.isNaN(numPart)) next = numPart + 1;
    }

    return `${prefix}${String(next).padStart(4, '0')}`;
}

// ── Validation helpers ─────────────────────────────────────────────

async function getPurchaseInvoiceRemaining(purchaseInvoiceId: string): Promise<{
    totalAmount: number;
    paidAmount: number;
    remaining: number;
    status: string;
    invoiceNumber: string;
}> {
    const inv = await prisma.purchaseInvoice.findUnique({
        where: { id: purchaseInvoiceId },
        select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
        },
    });

    if (!inv) throw new NotFoundError('PurchaseInvoice', purchaseInvoiceId);

    const totalAmount = Number(inv.totalAmount);
    const paidAmount = Number(inv.paidAmount);
    const remaining = totalAmount - paidAmount;

    return {
        totalAmount,
        paidAmount,
        remaining,
        status: String(inv.status),
        invoiceNumber: inv.invoiceNumber,
    };
}

// ── createRemittance ───────────────────────────────────────────────
// Validasi:
//  - total amount tiap invoice tidak melebihi sisa tagihan (fresh query)
//  - invoice PAID/CANCELLED tidak boleh masuk item baru
//  - invoice DRAFT juga diblok — recordSupplierPayment sendiri menolak
//    invoice yang belum di-approve finance ("Finance harus approve dulu")

export async function createPurchaseRemittance(
    input: CreatePurchaseRemittanceInput,
) {
    if (!input.items || input.items.length === 0) {
        throw new ValidationError(
            'Setoran harus memiliki minimal 1 item invoice',
        );
    }

    if (!input.userId) {
        throw new ValidationError('userId wajib diisi');
    }

    const amountByInvoice = new Map<string, number>();
    for (const it of input.items) {
        if (!it.purchaseInvoiceId)
            throw new ValidationError('purchaseInvoiceId wajib di setiap item');
        if (!it.amount || it.amount <= 0) {
            throw new ValidationError(
                `Amount item harus > 0 (invoice ${it.purchaseInvoiceId})`,
            );
        }
        if (!it.method) {
            throw new ValidationError(
                `Metode pembayaran wajib diisi (invoice ${it.purchaseInvoiceId})`,
            );
        }
        amountByInvoice.set(
            it.purchaseInvoiceId,
            (amountByInvoice.get(it.purchaseInvoiceId) ?? 0) + it.amount,
        );
    }

    for (const [purchaseInvoiceId, aggregatedAmount] of amountByInvoice) {
        const invInfo = await getPurchaseInvoiceRemaining(purchaseInvoiceId);

        if (invInfo.status === 'PAID' || invInfo.status === 'CANCELLED') {
            throw new BusinessRuleError(
                `Invoice ${invInfo.invoiceNumber} sudah ${invInfo.status}. Tidak bisa masuk setoran baru.`,
                { purchaseInvoiceId, status: invInfo.status },
                'INVOICE_ALREADY_CLOSED',
            );
        }

        if (invInfo.status === 'DRAFT') {
            throw new BusinessRuleError(
                `Invoice ${invInfo.invoiceNumber} masih DRAFT — finance harus approve dulu sebelum bisa disetorkan pembayarannya.`,
                { purchaseInvoiceId, status: invInfo.status },
                'INVOICE_NOT_APPROVED',
            );
        }

        if (aggregatedAmount > invInfo.remaining) {
            throw new BusinessRuleError(
                `Setoran untuk invoice ${invInfo.invoiceNumber} (${aggregatedAmount}) melebihi sisa tagihan ${invInfo.remaining}.`,
                {
                    purchaseInvoiceId,
                    requestedAmount: aggregatedAmount,
                    remaining: invInfo.remaining,
                },
                'REMITTANCE_EXCEEDS_REMAINING',
            );
        }
    }

    const remittanceNumber = await generatePurchaseRemittanceNumber(
        input.paidAt,
    );
    const totalAmount = input.items.reduce((s, it) => s + it.amount, 0);

    const created = await prisma.$transaction(async (tx) => {
        const remittance = await tx.purchaseRemittance.create({
            data: {
                remittanceNumber,
                userId: input.userId,
                paidAt: input.paidAt,
                totalAmount,
                status: 'PENDING',
                notes: input.notes ?? null,
                items: {
                    create: input.items.map((it) => ({
                        purchaseInvoiceId: it.purchaseInvoiceId,
                        amount: it.amount,
                        method: it.method,
                        referenceNumber: it.referenceNumber ?? null,
                        proofUrl: it.proofUrl ?? null,
                        proofStorageKey: it.proofStorageKey ?? null,
                        proofOriginalName: it.proofOriginalName ?? null,
                        proofMimeType: it.proofMimeType ?? null,
                        proofSizeBytes: it.proofSizeBytes ?? null,
                    })),
                },
            },
            include: { items: true },
        });

        return remittance;
    });

    await logActivity({
        userId: input.userId,
        action: 'PURCHASE_REMITTANCE_CREATED',
        entityType: 'PurchaseRemittance',
        entityId: created.id,
        details: `Setoran ${remittanceNumber} dibuat oleh ${input.userId}: ${input.items.length} item, total ${totalAmount}`,
    });

    await notifyFinanceOfPendingPurchaseRemittance(
        created.id,
        remittanceNumber,
        totalAmount,
    );

    return created;
}

// Notify FINANCE users a new purchase remittance is waiting for verification.
// Best-effort: failure here must not roll back the already-created remittance.
async function notifyFinanceOfPendingPurchaseRemittance(
    remittanceId: string,
    remittanceNumber: string,
    totalAmount: number,
) {
    try {
        const { NotificationService } =
            await import('@/services/core/notification-service');

        const financeUsers = await prisma.user.findMany({
            where: { role: 'FINANCE' },
            select: { id: true },
        });

        if (financeUsers.length === 0) return;

        await NotificationService.createBulkNotificationsThrottled(
            financeUsers.map((u) => ({
                userId: u.id,
                type: 'REMITTANCE_PENDING' as const,
                title: 'Setoran pembayaran supplier menunggu verifikasi',
                message: `Setoran ${remittanceNumber} (${totalAmount}) menunggu verifikasi.`,
                link: `/finance/payments/sent?tab=remittance`,
                entityType: 'PurchaseRemittance',
                entityId: remittanceId,
            })),
        );
    } catch (err) {
        logger.warn(
            '[PurchaseRemittanceService] Failed to notify FINANCE users',
            {
                remittanceId,
                error: err instanceof Error ? err.message : String(err),
            },
        );
    }
}

// ── verifyRemittance ───────────────────────────────────────────────
// Guard idempotency dengan atomic conditional update (updateMany where status PENDING).
// recordSupplierPayment TIDAK composable dalam $transaction (pakai prisma global langsung),
// jadi loop di luar transaction — catch per-item, kumpulkan sukses/gagal (partial success).

export async function verifyPurchaseRemittance(
    remittanceId: string,
    verifierId: string,
    notes?: string,
    deps?: {
        recordPayment?: (args: {
            invoiceId: string;
            amount: number;
            paymentDate: Date;
            method: string;
            referenceNumber?: string;
            notes?: string;
        }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        findLatestPaymentId?: (
            purchaseInvoiceId: string,
        ) => Promise<string | null>;
    },
): Promise<VerifyPurchaseRemittanceResult> {
    const claimed = await prisma.purchaseRemittance.updateMany({
        where: { id: remittanceId, status: 'PENDING' },
        data: {
            status: 'VERIFIED',
            verifiedById: verifierId,
            verifiedAt: new Date(),
            ...(notes ? { notes } : {}),
        },
    });

    if (claimed.count === 0) {
        throw new BusinessRuleError(
            'Setoran ini sudah diverifikasi/ditolak sebelumnya, atau sedang diproses.',
            { remittanceId },
            'REMITTANCE_ALREADY_PROCESSED',
        );
    }

    const remittance = await prisma.purchaseRemittance.findUnique({
        where: { id: remittanceId },
        include: { items: true },
    });

    if (!remittance) {
        throw new NotFoundError('PurchaseRemittance', remittanceId);
    }

    await logActivity({
        userId: verifierId,
        action: 'PURCHASE_REMITTANCE_VERIFIED',
        entityType: 'PurchaseRemittance',
        entityId: remittance.id,
        details: `Setoran ${remittance.remittanceNumber} diverifikasi oleh ${verifierId}`,
        fromStatus: 'PENDING',
        toStatus: 'VERIFIED',
    });

    const itemsToProcess = remittance.items.filter(
        (it) => it.paymentId == null,
    );

    const recordPayment =
        deps?.recordPayment ??
        (async (args: {
            invoiceId: string;
            amount: number;
            paymentDate: Date;
            method: string;
            referenceNumber?: string;
            notes?: string;
        }) => {
            const { recordSupplierPayment } =
                await import('@/actions/finance/payment-mutation-actions');
            const res = await (
                recordSupplierPayment as unknown as (
                    d: typeof args,
                ) => Promise<{
                    success: boolean;
                    data?: unknown;
                    error?: string;
                }>
            )(args);
            return res;
        });

    const findLatestPaymentId =
        deps?.findLatestPaymentId ??
        (async (purchaseInvoiceId: string): Promise<string | null> => {
            const payment = await prisma.purchasePayment.findFirst({
                where: { purchaseInvoiceId },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            });
            return payment?.id ?? null;
        });

    const results: VerifyPurchaseRemittanceItemResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const item of itemsToProcess) {
        try {
            const paymentRes = await recordPayment({
                invoiceId: item.purchaseInvoiceId,
                amount: Number(item.amount),
                paymentDate: remittance.paidAt,
                method: item.method,
                referenceNumber: item.referenceNumber ?? undefined,
                notes: `Purchase remittance ${remittance.remittanceNumber} item ${item.id}`,
            });

            if (!paymentRes.success) {
                throw new BusinessRuleError(
                    paymentRes.error ??
                        'recordSupplierPayment gagal tanpa pesan error',
                    {
                        purchaseInvoiceId: item.purchaseInvoiceId,
                        amount: Number(item.amount),
                    },
                );
            }

            let paymentId: string | null = null;
            const dataAny = paymentRes.data as
                | Record<string, unknown>
                | undefined;
            if (dataAny && typeof dataAny.paymentId === 'string') {
                paymentId = dataAny.paymentId as string;
            } else if (
                dataAny &&
                typeof (dataAny as { id?: string }).id === 'string'
            ) {
                paymentId = (dataAny as { id: string }).id;
            } else {
                paymentId = await findLatestPaymentId(item.purchaseInvoiceId);
            }

            if (!paymentId) {
                throw new BusinessRuleError(
                    `Payment berhasil dicatat untuk invoice ${item.purchaseInvoiceId} tapi paymentId tidak ditemukan — perlu follow-up manual.`,
                    { purchaseInvoiceId: item.purchaseInvoiceId },
                );
            }

            await prisma.purchaseRemittanceItem.update({
                where: { id: item.id },
                data: { paymentId },
            });

            results.push({
                itemId: item.id,
                purchaseInvoiceId: item.purchaseInvoiceId,
                success: true,
                paymentId,
            });
            successCount++;
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : String(err ?? 'Unknown error');

            logger.warn(
                '[PurchaseRemittanceService] Item verification failed',
                {
                    remittanceId,
                    itemId: item.id,
                    purchaseInvoiceId: item.purchaseInvoiceId,
                    error: message,
                },
            );

            await logActivity({
                userId: verifierId,
                action: 'PURCHASE_REMITTANCE_ITEM_FAILED',
                entityType: 'PurchaseRemittanceItem',
                entityId: item.id,
                details: `Item ${item.id} (invoice ${item.purchaseInvoiceId}) gagal diverifikasi: ${message}`,
            });

            results.push({
                itemId: item.id,
                purchaseInvoiceId: item.purchaseInvoiceId,
                success: false,
                error: message,
            });
            failedCount++;
        }
    }

    const alreadyProcessed = remittance.items.filter(
        (it) => it.paymentId != null,
    );
    for (const it of alreadyProcessed) {
        results.push({
            itemId: it.id,
            purchaseInvoiceId: it.purchaseInvoiceId,
            success: true,
            paymentId: it.paymentId ?? undefined,
        });
        successCount++;
    }

    if (failedCount > 0) {
        const appendNote = `Partial: ${successCount} sukses, ${failedCount} gagal — ${results
            .filter((r) => !r.success)
            .map((r) => `${r.purchaseInvoiceId}: ${r.error}`)
            .join('; ')}`;
        try {
            await prisma.purchaseRemittance.update({
                where: { id: remittanceId },
                data: {
                    notes: remittance.notes
                        ? `${remittance.notes}\n${appendNote}`
                        : appendNote,
                },
            });
        } catch {
            // Non-critical: best-effort append failure context to notes
        }
    }

    return {
        remittanceId: remittance.id,
        remittanceNumber: remittance.remittanceNumber,
        successCount,
        failedCount,
        items: results,
    };
}

// ── rejectRemittance ───────────────────────────────────────────────

export async function rejectPurchaseRemittance(
    remittanceId: string,
    verifierId: string,
    reason: string,
): Promise<{ id: string; remittanceNumber: string }> {
    if (!reason || reason.trim().length === 0) {
        throw new ValidationError('Alasan penolakan setoran wajib diisi');
    }

    const claimed = await prisma.purchaseRemittance.updateMany({
        where: { id: remittanceId, status: 'PENDING' },
        data: {
            status: 'REJECTED',
            verifiedById: verifierId,
            verifiedAt: new Date(),
            notes: reason,
        },
    });

    if (claimed.count === 0) {
        throw new BusinessRuleError(
            'Setoran ini sudah diverifikasi/ditolak sebelumnya, atau sedang diproses.',
            { remittanceId },
            'REMITTANCE_ALREADY_PROCESSED',
        );
    }

    const remittance = await prisma.purchaseRemittance.findUnique({
        where: { id: remittanceId },
        select: { id: true, remittanceNumber: true },
    });

    if (!remittance) {
        throw new NotFoundError('PurchaseRemittance', remittanceId);
    }

    await logActivity({
        userId: verifierId,
        action: 'PURCHASE_REMITTANCE_REJECTED',
        entityType: 'PurchaseRemittance',
        entityId: remittance.id,
        details: `Setoran ${remittance.remittanceNumber} ditolak oleh ${verifierId}: ${reason}`,
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
    });

    return { id: remittance.id, remittanceNumber: remittance.remittanceNumber };
}

// ── list helpers ───────────────────────────────────────────────────

export interface ListPurchaseRemittancesFilter {
    userId?: string;
    status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
    from?: Date;
    to?: Date;
    limit?: number;
}

export async function listPurchaseRemittances(
    filter: ListPurchaseRemittancesFilter = {},
) {
    const where: Record<string, unknown> = {};

    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
        const paidAt: Record<string, Date> = {};
        if (filter.from) paidAt.gte = filter.from;
        if (filter.to) paidAt.lte = filter.to;
        where.paidAt = paidAt;
    }

    const rows = await prisma.purchaseRemittance.findMany({
        where,
        include: {
            items: { include: { purchaseInvoice: true } },
            user: { select: { id: true, name: true } },
        },
        orderBy: { paidAt: 'desc' },
        ...(filter.limit ? { take: filter.limit } : {}),
    });

    return rows;
}

export async function getPurchaseRemittanceById(id: string) {
    const remittance = await prisma.purchaseRemittance.findUnique({
        where: { id },
        include: {
            items: { include: { purchaseInvoice: true } },
            user: { select: { id: true, name: true } },
        },
    });

    if (!remittance) throw new NotFoundError('PurchaseRemittance', id);

    return remittance;
}
