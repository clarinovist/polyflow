import { JournalStatus, type Prisma } from '@prisma/client';

import { prisma } from '@/lib/core/prisma';

import {
    handlePurchaseInvoiceCreated,
    handleSalesInvoiceCreated,
} from './auto-journal-invoice-handlers';
import {
    handlePurchasePayment,
    handleSalesPayment,
} from './auto-journal-payment-handlers';
import {
    handlePurchaseReturnShipped,
    handleSalesReturnReceived,
} from './auto-journal-return-handlers';

export type EnsureJournalKind =
    | 'SALES_INVOICE'
    | 'PURCHASE_INVOICE'
    | 'SALES_PAYMENT'
    | 'PURCHASE_PAYMENT';

export type EnsureJournalOutcome = {
    action: 'created' | 'exists' | 'promoted' | 'skipped';
    reason?: string;
    journalId?: string;
};

export class AutoJournalService {
    static async handleSalesInvoiceCreated(
        invoiceId: string,
        options?: { tx?: Prisma.TransactionClient; refreshDraft?: boolean },
    ) {
        return handleSalesInvoiceCreated(invoiceId, options);
    }

    static async handlePurchaseInvoiceCreated(invoiceId: string) {
        return handlePurchaseInvoiceCreated(invoiceId);
    }

    static async handleSalesPayment(
        paymentId: string,
        amount: number,
        method: string = 'Bank Transfer',
        journalDate?: Date,
        tx?: Prisma.TransactionClient,
    ) {
        return handleSalesPayment(paymentId, amount, method, journalDate, tx);
    }

    static async handlePurchasePayment(
        paymentId: string,
        amount: number,
        method: string = 'Bank Transfer',
        journalDate?: Date,
        tx?: Prisma.TransactionClient,
    ) {
        return handlePurchasePayment(
            paymentId,
            amount,
            method,
            journalDate,
            tx,
        );
    }

    static async handleSalesReturnReceived(returnId: string) {
        return handleSalesReturnReceived(returnId);
    }

    static async handlePurchaseReturnShipped(returnId: string) {
        return handlePurchaseReturnShipped(returnId);
    }

    /**
     * Idempotent "make sure this document has a journal in the right status".
     *
     * Legacy creation-time call sites ran post-commit with swallowed errors, so
     * a transient failure (unresolvable account, closed period, ...) could leave
     * the document permanently journal-less. This is the single entry point
     * for repair paths (health checks, backfill scripts): safe to call any
     * number of times — existing journals are kept (never duplicated), DRAFT
     * journals of already-approved invoices are promoted to POSTED.
     */
    static async ensureDocumentJournal(
        kind: EnsureJournalKind,
        refId: string,
        options?: { journalDate?: Date },
    ): Promise<EnsureJournalOutcome> {
        if (kind === 'SALES_PAYMENT' || kind === 'PURCHASE_PAYMENT') {
            const member = await prisma.payment.findUnique({ where: { id: refId }, select: { barterSettlementId: true, method: true } });
            if (member?.barterSettlementId) {
                const { collectBarterHealth } = await import('./barter-health-service');
                const health = await collectBarterHealth(prisma, undefined, member.barterSettlementId);
                return { action: 'skipped', reason: health.scanned !== 1 || health.issues.length ? 'barter_bundle_invalid' : 'barter_bundle_verified' };
            }
            if (member?.method === 'Barter') return { action: 'skipped', reason: 'orphan_barter_payment' };
        }
        const existing = await prisma.journalEntry.findFirst({
            where: {
                referenceType: kind,
                referenceId: refId,
                status: { not: JournalStatus.VOIDED },
            },
            select: { id: true },
        });

        if (existing) {
            if (kind === 'SALES_INVOICE' || kind === 'PURCHASE_INVOICE') {
                if (kind === 'SALES_INVOICE') {
                    const { postSalesInvoiceJournal } = await import('./sales-recognition-service');
                    return prisma.$transaction(tx => postSalesInvoiceJournal(tx, refId));
                }
                return this.promoteIfApproved(kind, refId, existing.id);
            }
            return { action: 'exists', journalId: existing.id };
        }

        switch (kind) {
            case 'SALES_INVOICE':
                await handleSalesInvoiceCreated(refId, options);
                return { action: 'created' };
            case 'PURCHASE_INVOICE':
                await handlePurchaseInvoiceCreated(refId, options);
                return { action: 'created' };
            case 'SALES_PAYMENT':
            case 'PURCHASE_PAYMENT': {
                const payment = await prisma.payment.findUnique({
                    where: { id: refId },
                    select: {
                        amount: true,
                        method: true,
                        barterSettlementId: true,
                        barterLeg: true,
                    },
                });
                if (!payment) {
                    return { action: 'skipped', reason: 'payment_not_found' };
                }
                if (payment.barterSettlementId) return { action: 'skipped', reason: 'barter_bundle_requires_diagnosis' };
                if (
                    payment.method === 'Barter' &&
                    !payment.barterSettlementId
                ) {
                    return { action: 'skipped', reason: 'orphan_barter_payment' };
                }
                const amount = payment.amount.toNumber();
                if (!amount || amount <= 0 || !isFinite(amount)) {
                    return { action: 'skipped', reason: 'invalid_amount' };
                }
                const method = payment.method || 'Bank Transfer';
                if (kind === 'SALES_PAYMENT') {
                    await handleSalesPayment(
                        refId,
                        amount,
                        method,
                        options?.journalDate,
                    );
                } else {
                    await handlePurchasePayment(
                        refId,
                        amount,
                        method,
                        options?.journalDate,
                    );
                }
                return { action: 'created' };
            }
        }
    }

    /**
     * An approved invoice must never sit on a DRAFT journal (reports read
     * POSTED only). Promotes every DRAFT journal of the reference when the
     * invoice has moved past DRAFT — mirrors updateInvoiceStatus mapping.
     */
    private static async promoteIfApproved(
        kind: 'SALES_INVOICE' | 'PURCHASE_INVOICE',
        refId: string,
        journalId: string,
    ): Promise<EnsureJournalOutcome> {
        const invoice =
            kind === 'SALES_INVOICE'
                ? await prisma.invoice.findUnique({
                      where: { id: refId },
                      select: { status: true },
                  })
                : await prisma.purchaseInvoice.findUnique({
                      where: { id: refId },
                      select: { status: true },
                  });

        if (!invoice || invoice.status === 'DRAFT') {
            return { action: 'exists', journalId };
        }

        const result = await prisma.journalEntry.updateMany({
            where: {
                referenceType: kind,
                referenceId: refId,
                status: JournalStatus.DRAFT,
            },
            data: { status: JournalStatus.POSTED },
        });
        return {
            action: result.count > 0 ? 'promoted' : 'exists',
            journalId,
        };
    }

    // DELEGATED: Auto-journaling for material issues is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleMaterialIssue(issueId: string) {
        return;
    }

    // DELEGATED: Auto-journaling for production output is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleProductionOutput(executionId: string) {
        return;
    }

    // DELEGATED: Auto-journaling for scrap output is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleScrapOutput(scrapId: string) {
        return;
    }

    // DELEGATED: Auto-journaling for general stock movements is handled directly via AccountingService.recordInventoryMovement.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static async handleStockMovement(movementId: string) {
        return;
    }
}
