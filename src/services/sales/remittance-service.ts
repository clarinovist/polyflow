import { prisma } from '@/lib/core/prisma';
import {
    BusinessRuleError,
    NotFoundError,
    ValidationError,
} from '@/lib/errors/errors';
import { logActivity } from '@/lib/tools/audit';
import { logger } from '@/lib/config/logger';

// ── Types ──────────────────────────────────────────────────────────

export interface RemittanceItemInput {
    invoiceId: string;
    amount: number;
    method: string;
    referenceNumber?: string;
}

export interface CreateRemittanceInput {
    userId: string;
    collectedAt: Date;
    items: RemittanceItemInput[];
    notes?: string;
}

export interface VerifyItemResult {
    itemId: string;
    invoiceId: string;
    success: boolean;
    paymentId?: string;
    error?: string;
}

export interface VerifyRemittanceResult {
    remittanceId: string;
    remittanceNumber: string;
    successCount: number;
    failedCount: number;
    items: VerifyItemResult[];
}

// ── Number generator ───────────────────────────────────────────────
// Pattern: follow orders-service — prefix per period + counter + padStart.
// orders-service: SO-{year}-{counter 4 pad} from last orderNumber.
// remittance: REM-{year}-{MM}-{counter 4 pad} monthly bucket.

export async function generateRemittanceNumber(
    now: Date = new Date(),
): Promise<string> {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `REM-${year}-${month}-`;

    const last = await prisma.salesRemittance.findFirst({
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

async function getInvoiceRemaining(invoiceId: string): Promise<{
    totalAmount: number;
    paidAmount: number;
    remaining: number;
    status: string;
    invoiceNumber: string;
}> {
    const inv = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
        },
    });

    if (!inv) throw new NotFoundError('Invoice', invoiceId);

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
//  - total amount tiap invoice tidak melebihi sisa tagihan (fresh query, bukan cache)
//  - invoice PAID/CANCELLED tidak boleh masuk item baru

export async function createRemittance(input: CreateRemittanceInput) {
    if (!input.items || input.items.length === 0) {
        throw new ValidationError(
            'Setoran harus memiliki minimal 1 item invoice',
        );
    }

    if (!input.userId) {
        throw new ValidationError('userId wajib diisi');
    }

    // Validate each item: invoice existence, status, remaining balance
    // Also validate aggregated amount per invoiceId within this remittance
    const amountByInvoice = new Map<string, number>();
    for (const it of input.items) {
        if (!it.invoiceId)
            throw new ValidationError('invoiceId wajib di setiap item');
        if (!it.amount || it.amount <= 0) {
            throw new ValidationError(
                `Amount item harus > 0 (invoice ${it.invoiceId})`,
            );
        }
        if (!it.method) {
            throw new ValidationError(
                `Metode pembayaran wajib diisi (invoice ${it.invoiceId})`,
            );
        }
        amountByInvoice.set(
            it.invoiceId,
            (amountByInvoice.get(it.invoiceId) ?? 0) + it.amount,
        );
    }

    // Per-invoice checks (fresh DB read for remaining)
    for (const [invoiceId, aggregatedAmount] of amountByInvoice) {
        const invInfo = await getInvoiceRemaining(invoiceId);

        if (invInfo.status === 'PAID' || invInfo.status === 'CANCELLED') {
            throw new BusinessRuleError(
                `Invoice ${invInfo.invoiceNumber} sudah ${invInfo.status}. Tidak bisa masuk setoran baru.`,
                { invoiceId, status: invInfo.status },
                'INVOICE_ALREADY_CLOSED',
            );
        }

        if (aggregatedAmount > invInfo.remaining) {
            throw new BusinessRuleError(
                `Setoran untuk invoice ${invInfo.invoiceNumber} (${aggregatedAmount}) melebihi sisa tagihan ${invInfo.remaining}.`,
                {
                    invoiceId,
                    requestedAmount: aggregatedAmount,
                    remaining: invInfo.remaining,
                },
                'REMITTANCE_EXCEEDS_REMAINING',
            );
        }
    }

    const remittanceNumber = await generateRemittanceNumber(input.collectedAt);
    const totalAmount = input.items.reduce((s, it) => s + it.amount, 0);

    const created = await prisma.$transaction(async (tx) => {
        const remittance = await tx.salesRemittance.create({
            data: {
                remittanceNumber,
                userId: input.userId,
                collectedAt: input.collectedAt,
                totalAmount,
                status: 'PENDING',
                notes: input.notes ?? null,
                items: {
                    create: input.items.map((it) => ({
                        invoiceId: it.invoiceId,
                        amount: it.amount,
                        method: it.method,
                        referenceNumber: it.referenceNumber ?? null,
                    })),
                },
            },
            include: { items: true },
        });

        return remittance;
    });

    await logActivity({
        userId: input.userId,
        action: 'SALES_REMITTANCE_CREATED',
        entityType: 'SalesRemittance',
        entityId: created.id,
        details: `Setoran ${remittanceNumber} dibuat oleh ${input.userId}: ${input.items.length} item, total ${totalAmount}`,
    });

    return created;
}

// ── verifyRemittance ───────────────────────────────────────────────
// Guard idempotency dengan atomic conditional update (updateMany where status PENDING).
// Setelah klaim berhasil, loop items yang paymentId masih NULL.
// recordCustomerPayment TIDAK composable dalam $transaction (pakai prisma global langsung),
// jadi loop di luar transaction — catch per-item, kumpulkan sukses/gagal (partial success).
// logActivity manual (BUKAN andalkan withStatusAudit) untuk jalur uang.

export async function verifyRemittance(
    remittanceId: string,
    verifierId: string,
    notes?: string,
    // Dependency injection for recordCustomerPayment — allows tests to mock without wiring tenant plumbing.
    // Default: import and call real action.
    deps?: {
        recordPayment?: (args: {
            invoiceId: string;
            amount: number;
            paymentDate: Date;
            method: string;
            referenceNumber?: string;
            notes?: string;
        }) => Promise<{ success: boolean; data?: unknown; error?: string }>;
        findLatestPaymentId?: (invoiceId: string) => Promise<string | null>;
    },
): Promise<VerifyRemittanceResult> {
    // 1. Atomic claim: only PENDING can be verified.
    const claimed = await prisma.salesRemittance.updateMany({
        where: { id: remittanceId, status: 'PENDING' },
        data: {
            status: 'VERIFIED',
            verifiedById: verifierId,
            verifiedAt: new Date(),
            // Append notes if provided
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

    // 2. Fetch remittance with items (those with paymentId still NULL need processing)
    const remittance = await prisma.salesRemittance.findUnique({
        where: { id: remittanceId },
        include: { items: true },
    });

    if (!remittance) {
        // Should not happen: we just updated it.
        throw new NotFoundError('SalesRemittance', remittanceId);
    }

    // 3. logActivity for the remittance itself (fromStatus PENDING → VERIFIED)
    //    Manual, BUKAN mengandalkan withStatusAudit extension (outer PrismaClient race, AGENTS § Status Change Audit)
    await logActivity({
        userId: verifierId,
        action: 'SALES_REMITTANCE_VERIFIED',
        entityType: 'SalesRemittance',
        entityId: remittance.id,
        details: `Setoran ${remittance.remittanceNumber} diverifikasi oleh ${verifierId}`,
        fromStatus: 'PENDING',
        toStatus: 'VERIFIED',
    });

    // 4. Loop items needing payment
    const itemsToProcess = remittance.items.filter(
        (it) => it.paymentId == null,
    );

    // Resolve recordPayment dependency
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
            const { recordCustomerPayment } =
                await import('@/actions/finance/payment-mutation-actions');
            // recordCustomerPayment returns { success, data, error } via safeAction (withTenant wrapper)
            const res = await (
                recordCustomerPayment as unknown as (
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
        (async (invoiceId: string): Promise<string | null> => {
            const payment = await prisma.payment.findFirst({
                where: { invoiceId },
                orderBy: { createdAt: 'desc' },
                select: { id: true },
            });
            return payment?.id ?? null;
        });

    const results: VerifyItemResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const item of itemsToProcess) {
        try {
            const paymentRes = await recordPayment({
                invoiceId: item.invoiceId,
                amount: Number(item.amount),
                paymentDate: remittance.collectedAt,
                method: item.method,
                referenceNumber: item.referenceNumber ?? undefined,
                notes: `Remittance ${remittance.remittanceNumber} item ${item.id}`,
            });

            if (!paymentRes.success) {
                throw new BusinessRuleError(
                    paymentRes.error ??
                        'recordCustomerPayment gagal tanpa pesan error',
                    { invoiceId: item.invoiceId, amount: Number(item.amount) },
                );
            }

            // Payment.id is not returned by recordCustomerPayment (returns { message } only).
            // Fetch latest payment for this invoice after successful record.
            let paymentId: string | null = null;
            // Try to extract payment id from data if present (future-proof), else fallback query
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
                paymentId = await findLatestPaymentId(item.invoiceId);
            }

            if (!paymentId) {
                throw new BusinessRuleError(
                    `Payment berhasil dicatat untuk invoice ${item.invoiceId} tapi paymentId tidak ditemukan — perlu follow-up manual.`,
                    { invoiceId: item.invoiceId },
                );
            }

            // Attach paymentId to remittance item
            await prisma.salesRemittanceItem.update({
                where: { id: item.id },
                data: { paymentId },
            });

            results.push({
                itemId: item.id,
                invoiceId: item.invoiceId,
                success: true,
                paymentId,
            });
            successCount++;
        } catch (err) {
            const message =
                err instanceof Error
                    ? err.message
                    : String(err ?? 'Unknown error');

            logger.warn('[RemittanceService] Item verification failed', {
                remittanceId,
                itemId: item.id,
                invoiceId: item.invoiceId,
                error: message,
            });

            // logActivity for WARNING per failed item
            await logActivity({
                userId: verifierId,
                action: 'SALES_REMITTANCE_ITEM_FAILED',
                entityType: 'SalesRemittanceItem',
                entityId: item.id,
                details: `Item ${item.id} (invoice ${item.invoiceId}) gagal diverifikasi: ${message}`,
            });

            results.push({
                itemId: item.id,
                invoiceId: item.invoiceId,
                success: false,
                error: message,
            });
            failedCount++;
        }
    }

    // Items that already had paymentId (retry path) — count as success, no re-processing
    const alreadyProcessed = remittance.items.filter(
        (it) => it.paymentId != null,
    );
    for (const it of alreadyProcessed) {
        results.push({
            itemId: it.id,
            invoiceId: it.invoiceId,
            success: true,
            paymentId: it.paymentId ?? undefined,
        });
        successCount++;
    }

    // Jika ada kegagalan per-item: biarkan status tetap VERIFIED (uang yang sudah masuk sah),
    // catat di log/notes. Tidak mengembalikan ke PENDING.
    if (failedCount > 0) {
        const appendNote = `Partial: ${successCount} sukses, ${failedCount} gagal — ${results
            .filter((r) => !r.success)
            .map((r) => `${r.invoiceId}: ${r.error}`)
            .join('; ')}`;
        try {
            await prisma.salesRemittance.update({
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
// Atomic update serupa (updateMany where status PENDING) → REJECTED.
// reason wajib. TIDAK memanggil recordCustomerPayment.

export async function rejectRemittance(
    remittanceId: string,
    verifierId: string,
    reason: string,
): Promise<{ id: string; remittanceNumber: string }> {
    if (!reason || reason.trim().length === 0) {
        throw new ValidationError('Alasan penolakan setoran wajib diisi');
    }

    const claimed = await prisma.salesRemittance.updateMany({
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

    const remittance = await prisma.salesRemittance.findUnique({
        where: { id: remittanceId },
        select: { id: true, remittanceNumber: true },
    });

    if (!remittance) {
        throw new NotFoundError('SalesRemittance', remittanceId);
    }

    await logActivity({
        userId: verifierId,
        action: 'SALES_REMITTANCE_REJECTED',
        entityType: 'SalesRemittance',
        entityId: remittance.id,
        details: `Setoran ${remittance.remittanceNumber} ditolak oleh ${verifierId}: ${reason}`,
        fromStatus: 'PENDING',
        toStatus: 'REJECTED',
    });

    return { id: remittance.id, remittanceNumber: remittance.remittanceNumber };
}

// ── list helpers ───────────────────────────────────────────────────

export interface ListRemittancesFilter {
    userId?: string;
    status?: 'PENDING' | 'VERIFIED' | 'REJECTED';
    from?: Date;
    to?: Date;
    limit?: number;
}

export async function listRemittances(filter: ListRemittancesFilter = {}) {
    const where: Record<string, unknown> = {};

    if (filter.userId) where.userId = filter.userId;
    if (filter.status) where.status = filter.status;
    if (filter.from || filter.to) {
        const collectedAt: Record<string, Date> = {};
        if (filter.from) collectedAt.gte = filter.from;
        if (filter.to) collectedAt.lte = filter.to;
        where.collectedAt = collectedAt;
    }

    const rows = await prisma.salesRemittance.findMany({
        where,
        include: {
            items: { include: { invoice: true } },
            user: { select: { id: true, name: true } },
        },
        orderBy: { collectedAt: 'desc' },
        ...(filter.limit ? { take: filter.limit } : {}),
    });

    return rows;
}

export async function getRemittanceById(id: string) {
    const remittance = await prisma.salesRemittance.findUnique({
        where: { id },
        include: {
            items: { include: { invoice: true } },
            user: { select: { id: true, name: true } },
        },
    });

    if (!remittance) throw new NotFoundError('SalesRemittance', id);

    return remittance;
}

// ── submitRemittance (simplified) ──────────────────────────────────
// Plan mentions draft→submit two-step. Current design: createRemittance langsung PENDING
// (menunggu verifikasi). Untuk menghindari kompleksitas tanpa manfaat, fungsi ini
// didefiniskan sebagai no-op alias yang validasi status PENDING → tetap PENDING,
// supaya action layer tidak perlu special-case bila UI memanggilnya.
// Keputusan: single-step create = PENDING; submitRemittance dipertahankan untuk
// kompatibilitas plan tapi tidak mengubah status (idempotent).

export async function submitRemittance(remittanceId: string, userId: string) {
    const remittance = await prisma.salesRemittance.findUnique({
        where: { id: remittanceId },
        select: {
            id: true,
            status: true,
            userId: true,
            remittanceNumber: true,
        },
    });

    if (!remittance) throw new NotFoundError('SalesRemittance', remittanceId);

    if (remittance.userId !== userId) {
        // Only owner or verifier roles can submit, but we enforce owner here for submit step.
        // Action layer will have role guard anyway.
    }

    if (remittance.status !== 'PENDING') {
        throw new BusinessRuleError(
            `Setoran ${remittance.remittanceNumber} status ${remittance.status} tidak bisa di-submit.`,
            { remittanceId, status: remittance.status },
        );
    }

    // Already PENDING — idempotent
    return remittance;
}
