import { createHash, randomUUID } from 'node:crypto';

import {
    BarterLeg,
    BarterSettlementStatus,
    Prisma,
    type InvoiceStatus,
    type PurchaseInvoiceStatus,
} from '@prisma/client';

import { prisma } from '@/lib/core/prisma';
import { BusinessRuleError, NotFoundError } from '@/lib/errors/errors';
import {
    calculateBarterSummary,
    statusForRemainingBalance,
    toMoneyDecimal,
} from '@/lib/finance/barter';
import { normalizePaymentMethodFields } from '@/lib/finance/payment-methods';
import type {
    ParsedCreateBarterSettlementInput,
    VoidBarterSettlementInput,
} from '@/lib/schemas/barter';
import { logActivity } from '@/lib/tools/audit';
import { normalizeToBusinessDay } from '@/lib/utils/timezone';
import { getNextSequence } from '@/lib/utils/sequence';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { getPaymentBanksSetting } from '@/services/settings/app-settings-service';

import { resolvePaymentBankAccount } from './auto-journal-shared';
import { BarterJournalService } from './barter-journal-service';
import { retryBarterWrite } from './barter-write-retry';
import {
    postSalesInvoiceJournal,
    requireOpenJournalPeriod,
} from './sales-recognition-service';

const SETTLEMENT_INCLUDE = {
    barterPartner: { include: { customer: true, supplier: true } },
    invoice: true,
    purchaseInvoice: true,
    payments: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.BarterSettlementInclude;

export function buildBarterPayloadFingerprint(
    input: ParsedCreateBarterSettlementInput,
): string {
    const cashEnabled = input.includeCashPayment;
    return createHash('sha256')
        .update(
            JSON.stringify({
                invoiceId: input.invoiceId,
                purchaseInvoiceId: input.purchaseInvoiceId,
                barterAmount: toMoneyDecimal(
                    input.barterAmount,
                    'Nominal barter',
                ).toFixed(2),
                barterDate: normalizeToBusinessDay(
                    input.barterDate,
                ).toISOString(),
                includeCashPayment: cashEnabled,
                cashAmount: cashEnabled
                    ? toMoneyDecimal(
                          input.cashAmount ?? 0,
                          'Pembayaran tambahan',
                      ).toFixed(2)
                    : '0.00',
                cashMethod: cashEnabled ? input.cashMethod?.trim() : null,
                cashPaymentDate:
                    cashEnabled && input.cashPaymentDate
                        ? normalizeToBusinessDay(
                              input.cashPaymentDate,
                          ).toISOString()
                        : null,
                cashReferenceNumber: cashEnabled
                    ? input.cashReferenceNumber?.trim() || null
                    : null,
                notes: input.notes.trim(),
            }),
        )
        .digest('hex');
}

async function loadSettlementAccounts(
    tx: Prisma.TransactionClient,
    cashMethod?: string,
    destinationBank?: string | null,
) {
    const [receivableResolved, payableResolved, cashResolved] =
        await Promise.all([
            resolveAccount('accounts-receivable'),
            resolveAccount('accounts-payable'),
            cashMethod
                ? resolvePaymentBankAccount(cashMethod, destinationBank)
                : Promise.resolve(undefined),
        ]);
    const ids = [
        receivableResolved.id,
        payableResolved.id,
        ...(cashResolved ? [cashResolved.id] : []),
    ];
    const rows = await tx.account.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map((account) => [account.id, account]));
    const receivable = byId.get(receivableResolved.id);
    const payable = byId.get(payableResolved.id);
    const cash = cashResolved ? byId.get(cashResolved.id) : undefined;
    if (!receivable || !payable || (cashResolved && !cash)) {
        throw new BusinessRuleError(
            'Mapping akun barter tidak ditemukan pada database tenant.',
            undefined,
            'BARTER_ACCOUNT_NOT_FOUND',
        );
    }
    if (
        receivable.currency !== payable.currency ||
        (cash && cash.currency !== receivable.currency)
    ) {
        throw new BusinessRuleError(
            'Akun barter dan pembayaran tambahan harus memakai mata uang yang sama.',
            undefined,
            'BARTER_CURRENCY_MISMATCH',
        );
    }
    return { receivable, payable, cash };
}

export class BarterSettlementService {
    static async create(
        input: ParsedCreateBarterSettlementInput,
        userId: string,
    ) {
        const fingerprint = buildBarterPayloadFingerprint(input);
        const existing = await prisma.barterSettlement.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
            include: SETTLEMENT_INCLUDE,
        });
        if (existing) {
            if (existing.payloadFingerprint !== fingerprint) {
                throw new BusinessRuleError(
                    'Kunci idempotensi sudah dipakai untuk payload barter yang berbeda.',
                    undefined,
                    'BARTER_IDEMPOTENCY_CONFLICT',
                );
            }
            return existing;
        }

        const cashAmount = input.includeCashPayment
            ? toMoneyDecimal(input.cashAmount ?? 0, 'Pembayaran tambahan')
            : new Prisma.Decimal(0);
        if (input.includeCashPayment && cashAmount.lte(0)) {
            throw new BusinessRuleError(
                'Pembayaran tambahan yang diaktifkan harus lebih dari nol.',
                undefined,
                'BARTER_CASH_REQUIRED',
            );
        }

        let cashFields:
            | {
                  method: string;
                  referenceNumber: string | null;
                  destinationBank: string | null;
              }
            | undefined;
        if (input.includeCashPayment) {
            const requestedMethod = input.cashMethod?.trim() ?? '';
            if (
                requestedMethod !== 'Cash' &&
                !requestedMethod.startsWith('Transfer ')
            ) {
                throw new BusinessRuleError(
                    'Pembayaran tambahan barter hanya mendukung Tunai atau Transfer.',
                    undefined,
                    'BARTER_CASH_METHOD_INVALID',
                );
            }
            const banks = await getPaymentBanksSetting();
            if (
                requestedMethod.startsWith('Transfer ') &&
                !banks.some(
                    (bank) => `Transfer ${bank.name}` === requestedMethod,
                )
            ) {
                throw new BusinessRuleError(
                    'Rekening transfer belum dikonfigurasi untuk tenant ini.',
                    undefined,
                    'BARTER_BANK_NOT_CONFIGURED',
                );
            }
            cashFields = normalizePaymentMethodFields(
                {
                    method: requestedMethod,
                    referenceNumber: input.cashReferenceNumber,
                },
                banks,
            );
        }

        return retryBarterWrite(async () => {
            const [settlementNumber, arPaymentNumber, apOffsetPaymentNumber] =
                await Promise.all([
                    getNextSequence('BRT'),
                    getNextSequence('PAYMENT_IN'),
                    getNextSequence('PAYMENT_OUT'),
                ]);
            const apCashPaymentNumber = input.includeCashPayment
                ? await getNextSequence('PAYMENT_OUT')
                : null;

            return prisma.$transaction(
                async (tx) => {
                    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${input.idempotencyKey}))::text`;
                    const replay = await tx.barterSettlement.findUnique({
                        where: { idempotencyKey: input.idempotencyKey },
                        include: SETTLEMENT_INCLUDE,
                    });
                    if (replay) {
                        if (replay.payloadFingerprint !== fingerprint) {
                            throw new BusinessRuleError(
                                'Kunci idempotensi sudah dipakai untuk payload barter yang berbeda.',
                                undefined,
                                'BARTER_IDEMPOTENCY_CONFLICT',
                            );
                        }
                        return replay;
                    }

                    const invoiceIdentity = await tx.invoice.findUnique({
                        where: { id: input.invoiceId },
                        select: {
                            salesOrder: { select: { customerId: true } },
                        },
                    });
                    if (!invoiceIdentity?.salesOrder.customerId) {
                        throw new BusinessRuleError(
                            'Barter hanya tersedia untuk invoice customer eksternal.',
                            undefined,
                            'BARTER_EXTERNAL_CUSTOMER_REQUIRED',
                        );
                    }

                    await tx.$queryRaw`SELECT id FROM "BarterPartner" WHERE "customerId" = ${invoiceIdentity.salesOrder.customerId} FOR UPDATE`;
                    const partner = await tx.barterPartner.findUnique({
                        where: {
                            customerId: invoiceIdentity.salesOrder.customerId,
                        },
                        include: { customer: true, supplier: true },
                    });
                    if (!partner?.isActive) {
                        throw new BusinessRuleError(
                            'Customer belum memiliki izin barter aktif.',
                            undefined,
                            'BARTER_PARTNER_NOT_ACTIVE',
                        );
                    }
                    // Same order as partner configuration. Lock identities before FK writes
                    // and re-read activity under Serializable (concurrent changes retry).
                    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${partner.customerId} FOR UPDATE`;
                    await tx.$queryRaw`SELECT id FROM "Supplier" WHERE id = ${partner.supplierId} FOR UPDATE`;
                    if (
                        !partner.customer.isActive ||
                        partner.customer.lifecycleStatus === 'MERGED' ||
                        partner.customer.lifecycleStatus === 'INACTIVE' ||
                        !partner.supplier.isActive
                    ) {
                        throw new BusinessRuleError(
                            'Customer atau supplier pasangan tidak lagi aktif.',
                            undefined,
                            'BARTER_PARTNER_INACTIVE',
                        );
                    }

                    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${input.invoiceId} FOR UPDATE`;
                    const salesInvoice = await tx.invoice.findUnique({
                        where: { id: input.invoiceId },
                        include: {
                            salesOrder: {
                                select: { customerId: true, entrySource: true },
                            },
                        },
                    });
                    if (!salesInvoice) {
                        throw new NotFoundError('Invoice', input.invoiceId);
                    }
                    if (
                        salesInvoice.salesOrder.customerId !==
                            partner.customerId ||
                        !['UNPAID', 'PARTIAL', 'OVERDUE'].includes(
                            salesInvoice.status,
                        ) ||
                        salesInvoice.paidAmount.lt(0) ||
                        salesInvoice.paidAmount.gt(salesInvoice.totalAmount)
                    ) {
                        throw new BusinessRuleError(
                            'Invoice penjualan tidak memenuhi syarat barter.',
                            undefined,
                            'BARTER_SALES_INVOICE_INELIGIBLE',
                        );
                    }

                    await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id = ${input.purchaseInvoiceId} FOR UPDATE`;
                    const purchaseInvoice = await tx.purchaseInvoice.findUnique(
                        {
                            where: { id: input.purchaseInvoiceId },
                            include: {
                                purchaseOrder: { select: { supplierId: true } },
                            },
                        },
                    );
                    if (!purchaseInvoice) {
                        throw new NotFoundError(
                            'Purchase Invoice',
                            input.purchaseInvoiceId,
                        );
                    }
                    if (
                        purchaseInvoice.purchaseOrder.supplierId !==
                            partner.supplierId ||
                        !['UNPAID', 'PARTIAL', 'OVERDUE'].includes(
                            purchaseInvoice.status,
                        ) ||
                        purchaseInvoice.paidAmount.lt(0) ||
                        purchaseInvoice.paidAmount.gt(
                            purchaseInvoice.totalAmount,
                        )
                    ) {
                        throw new BusinessRuleError(
                            'Invoice pembelian tidak memenuhi syarat pasangan barter.',
                            undefined,
                            'BARTER_PURCHASE_INVOICE_INELIGIBLE',
                        );
                    }

                    const summary = calculateBarterSummary({
                        receivableBalance: salesInvoice.totalAmount.minus(
                            salesInvoice.paidAmount,
                        ),
                        payableBalance: purchaseInvoice.totalAmount.minus(
                            purchaseInvoice.paidAmount,
                        ),
                        barterAmount: input.barterAmount,
                        cashAmount,
                    });
                    const barterDate = normalizeToBusinessDay(input.barterDate);
                    const cashPaymentDate = input.includeCashPayment
                        ? normalizeToBusinessDay(input.cashPaymentDate!)
                        : null;
                    await requireOpenJournalPeriod(tx, barterDate);
                    if (cashPaymentDate) {
                        await requireOpenJournalPeriod(tx, cashPaymentDate);
                    }

                    await postSalesInvoiceJournal(tx, salesInvoice.id, userId);
                    const accounts = await loadSettlementAccounts(
                        tx,
                        cashFields?.method,
                        cashFields?.destinationBank,
                    );
                    await BarterJournalService.validatePurchaseInvoiceJournal(
                        tx,
                        purchaseInvoice.id,
                        purchaseInvoice.totalAmount,
                        accounts.payable.id,
                    );

                    const arPaymentId = randomUUID();
                    const apOffsetPaymentId = randomUUID();
                    const apCashPaymentId = input.includeCashPayment
                        ? randomUUID()
                        : null;
                    const settlement = await tx.barterSettlement.create({
                        data: {
                            settlementNumber,
                            idempotencyKey: input.idempotencyKey,
                            payloadFingerprint: fingerprint,
                            barterPartnerId: partner.id,
                            customerId: partner.customerId,
                            supplierId: partner.supplierId,
                            invoiceId: salesInvoice.id,
                            purchaseInvoiceId: purchaseInvoice.id,
                            barterAmount: summary.barterAmount,
                            cashAmount: summary.cashAmount,
                            receivableBefore: summary.receivableBefore,
                            payableBefore: summary.payableBefore,
                            receivableAfter: summary.receivableAfter,
                            payableAfter: summary.payableAfter,
                            barterDate,
                            cashPaymentDate,
                            cashMethod: cashFields?.method,
                            cashAccountId: accounts.cash?.id,
                            cashReferenceNumber: cashFields?.referenceNumber,
                            notes: input.notes.trim(),
                            arPaymentId,
                            arPaymentNumber,
                            apOffsetPaymentId,
                            apOffsetPaymentNumber,
                            apCashPaymentId,
                            apCashPaymentNumber,
                            offsetJournalId: null,
                            offsetJournalNumber: null,
                            cashJournalId: null,
                            cashJournalNumber: null,
                            createdById: userId,
                        },
                    });

                    const salesPaid = salesInvoice.paidAmount.plus(
                        summary.barterAmount,
                    );
                    const purchasePaid = purchaseInvoice.paidAmount
                        .plus(summary.barterAmount)
                        .plus(summary.cashAmount);
                    await tx.invoice.update({
                        where: { id: salesInvoice.id },
                        data: {
                            paidAmount: salesPaid,
                            status: statusForRemainingBalance(
                                salesInvoice.totalAmount.minus(salesPaid),
                                salesPaid,
                                salesInvoice.dueDate,
                            ) as InvoiceStatus,
                        },
                    });
                    await tx.purchaseInvoice.update({
                        where: { id: purchaseInvoice.id },
                        data: {
                            paidAmount: purchasePaid,
                            status: statusForRemainingBalance(
                                purchaseInvoice.totalAmount.minus(purchasePaid),
                                purchasePaid,
                                purchaseInvoice.dueDate,
                            ) as PurchaseInvoiceStatus,
                        },
                    });

                    await tx.payment.createMany({
                        data: [
                            {
                                id: arPaymentId,
                                paymentNumber: arPaymentNumber,
                                paymentDate: barterDate,
                                amount: summary.barterAmount,
                                method: 'Barter',
                                notes: input.notes.trim(),
                                invoiceId: salesInvoice.id,
                                barterSettlementId: settlement.id,
                                barterLeg: BarterLeg.AR_OFFSET,
                            },
                            {
                                id: apOffsetPaymentId,
                                paymentNumber: apOffsetPaymentNumber,
                                paymentDate: barterDate,
                                amount: summary.barterAmount,
                                method: 'Barter',
                                notes: input.notes.trim(),
                                purchaseInvoiceId: purchaseInvoice.id,
                                barterSettlementId: settlement.id,
                                barterLeg: BarterLeg.AP_OFFSET,
                            },
                            ...(apCashPaymentId &&
                            apCashPaymentNumber &&
                            cashFields
                                ? [
                                      {
                                          id: apCashPaymentId,
                                          paymentNumber: apCashPaymentNumber,
                                          paymentDate: cashPaymentDate!,
                                          amount: summary.cashAmount,
                                          method: cashFields.method,
                                          notes: input.notes.trim(),
                                          referenceNumber:
                                              cashFields.referenceNumber,
                                          destinationBank:
                                              cashFields.destinationBank,
                                          purchaseInvoiceId: purchaseInvoice.id,
                                          barterSettlementId: settlement.id,
                                          barterLeg: BarterLeg.AP_CASH,
                                      },
                                  ]
                                : []),
                        ],
                    });

                    const offsetJournal = await BarterJournalService.postOffset(
                        tx,
                        {
                            settlementId: settlement.id,
                            settlementNumber,
                            amount: summary.barterAmount,
                            entryDate: barterDate,
                            userId,
                            salesInvoiceNumber: salesInvoice.invoiceNumber,
                            purchaseInvoiceNumber:
                                purchaseInvoice.invoiceNumber,
                            accounts,
                        },
                    );
                    const cashJournal =
                        apCashPaymentId &&
                        apCashPaymentNumber &&
                        cashFields &&
                        cashPaymentDate
                            ? await BarterJournalService.postCashPayment(tx, {
                                  paymentId: apCashPaymentId,
                                  paymentNumber: apCashPaymentNumber,
                                  amount: summary.cashAmount,
                                  entryDate: cashPaymentDate,
                                  method: cashFields.method,
                                  destinationBank: cashFields.destinationBank,
                                  purchaseInvoiceNumber:
                                      purchaseInvoice.invoiceNumber,
                                  userId,
                                  accounts,
                              })
                            : null;

                    await tx.barterSettlement.update({
                        where: { id: settlement.id },
                        data: {
                            offsetJournalId: offsetJournal.id,
                            offsetJournalNumber: offsetJournal.entryNumber,
                            cashJournalId: cashJournal?.id,
                            cashJournalNumber: cashJournal?.entryNumber,
                        },
                    });
                    await logActivity({
                        userId,
                        action: 'CREATE_BARTER_SETTLEMENT',
                        entityType: 'BarterSettlement',
                        entityId: settlement.id,
                        details: `Posted ${settlementNumber}: barter ${summary.barterAmount.toFixed(2)}, cash ${summary.cashAmount.toFixed(2)}`,
                        toStatus: BarterSettlementStatus.POSTED,
                        tx,
                    });

                    return tx.barterSettlement.findUniqueOrThrow({
                        where: { id: settlement.id },
                        include: SETTLEMENT_INCLUDE,
                    });
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                    timeout: 30_000,
                },
            );
        });
    }

    static async void(input: VoidBarterSettlementInput, userId: string) {
        return retryBarterWrite(() =>
            prisma.$transaction(
                async (tx) => {
                    await tx.$queryRaw`SELECT id FROM "BarterSettlement" WHERE id = ${input.settlementId} FOR UPDATE`;
                    const settlement = await tx.barterSettlement.findUnique({
                        where: { id: input.settlementId },
                        include: { payments: true },
                    });
                    if (!settlement) {
                        throw new NotFoundError(
                            'Barter Settlement',
                            input.settlementId,
                        );
                    }
                    if (settlement.status === BarterSettlementStatus.VOIDED) {
                        return settlement;
                    }

                    await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${settlement.invoiceId} FOR UPDATE`;
                    await tx.$queryRaw`SELECT id FROM "PurchaseInvoice" WHERE id = ${settlement.purchaseInvoiceId} FOR UPDATE`;
                    const [salesInvoice, purchaseInvoice, journals] =
                        await Promise.all([
                            tx.invoice.findUnique({
                                where: { id: settlement.invoiceId },
                            }),
                            tx.purchaseInvoice.findUnique({
                                where: { id: settlement.purchaseInvoiceId },
                            }),
                            tx.journalEntry.findMany({
                                where: {
                                    id: {
                                        in: [
                                            settlement.offsetJournalId,
                                            settlement.cashJournalId,
                                        ].filter((id): id is string =>
                                            Boolean(id),
                                        ),
                                    },
                                },
                                include: {
                                    lines: {
                                        include: {
                                            bankReconciliationItems: {
                                                select: { id: true },
                                                take: 1,
                                            },
                                        },
                                    },
                                },
                            }),
                        ]);
                    if (!salesInvoice || !purchaseInvoice) {
                        throw new BusinessRuleError(
                            'Invoice sumber settlement tidak ditemukan.',
                            undefined,
                            'BARTER_SOURCE_MISSING',
                        );
                    }
                    const offsetJournal = journals.find(
                        (journal) => journal.id === settlement.offsetJournalId,
                    );
                    const cashJournal = settlement.cashJournalId
                        ? journals.find(
                              (journal) =>
                                  journal.id === settlement.cashJournalId,
                          )
                        : undefined;
                    if (
                        journals.length !==
                            (settlement.cashAmount.gt(0) ? 2 : 1) ||
                        !offsetJournal ||
                        offsetJournal.referenceType !== 'BARTER_SETTLEMENT' ||
                        offsetJournal.referenceId !== settlement.id ||
                        offsetJournal.status !== 'POSTED' ||
                        (settlement.cashAmount.gt(0) &&
                            (!cashJournal ||
                                cashJournal.referenceType !==
                                    'PURCHASE_PAYMENT' ||
                                cashJournal.referenceId !==
                                    settlement.apCashPaymentId ||
                                cashJournal.status !== 'POSTED'))
                    ) {
                        throw new BusinessRuleError(
                            'Bukti jurnal settlement tidak lengkap atau tidak cocok. Batalkan setelah diagnosis finance.',
                            undefined,
                            'BARTER_JOURNAL_MISSING',
                        );
                    }
                    const expectedLegs = settlement.cashAmount.gt(0)
                        ? ['AR_OFFSET', 'AP_OFFSET', 'AP_CASH']
                        : ['AR_OFFSET', 'AP_OFFSET'];
                    if (
                        settlement.payments.length !== expectedLegs.length ||
                        !expectedLegs.every((leg) =>
                            settlement.payments.some(
                                (payment) => payment.barterLeg === leg,
                            ),
                        )
                    ) {
                        throw new BusinessRuleError(
                            'Kaki pembayaran settlement tidak lengkap. Jalankan diagnosis finance sebelum pembatalan.',
                            undefined,
                            'BARTER_PAYMENT_LEGS_INVALID',
                        );
                    }
                    for (const journal of journals) {
                        await requireOpenJournalPeriod(tx, journal.entryDate);
                        if (
                            journal.lines.some(
                                (line) =>
                                    line.reconciledAt ||
                                    line.bankReconciliationItems.length > 0,
                            )
                        ) {
                            throw new BusinessRuleError(
                                'Settlement terkait rekonsiliasi bank. Lepaskan melalui workflow rekonsiliasi terlebih dahulu.',
                                undefined,
                                'BARTER_RECONCILED',
                            );
                        }
                    }
                    const paymentIds = settlement.payments.map(
                        (payment) => payment.id,
                    );
                    const [salesRemittanceCount, purchaseRemittanceCount] =
                        await Promise.all([
                            tx.salesRemittanceItem.count({
                                where: { paymentId: { in: paymentIds } },
                            }),
                            tx.purchaseRemittanceItem.count({
                                where: { paymentId: { in: paymentIds } },
                            }),
                        ]);
                    if (salesRemittanceCount || purchaseRemittanceCount) {
                        throw new BusinessRuleError(
                            'Settlement masih terkait remittance. Lepaskan melalui workflow remittance terlebih dahulu.',
                            undefined,
                            'BARTER_REMITTANCE_LINKED',
                        );
                    }

                    const salesPaid = salesInvoice.paidAmount.minus(
                        settlement.barterAmount,
                    );
                    const purchasePaid = purchaseInvoice.paidAmount
                        .minus(settlement.barterAmount)
                        .minus(settlement.cashAmount);
                    if (salesPaid.lt(0) || purchasePaid.lt(0)) {
                        throw new BusinessRuleError(
                            'Paid amount akan menjadi negatif. Settlement tidak dapat dibatalkan sebelum diagnosis finance.',
                            undefined,
                            'BARTER_VOID_NEGATIVE_BALANCE',
                        );
                    }
                    await tx.invoice.update({
                        where: { id: salesInvoice.id },
                        data: {
                            paidAmount: salesPaid,
                            status: statusForRemainingBalance(
                                salesInvoice.totalAmount.minus(salesPaid),
                                salesPaid,
                                salesInvoice.dueDate,
                            ) as InvoiceStatus,
                        },
                    });
                    await tx.purchaseInvoice.update({
                        where: { id: purchaseInvoice.id },
                        data: {
                            paidAmount: purchasePaid,
                            status: statusForRemainingBalance(
                                purchaseInvoice.totalAmount.minus(purchasePaid),
                                purchasePaid,
                                purchaseInvoice.dueDate,
                            ) as PurchaseInvoiceStatus,
                        },
                    });
                    await tx.journalEntry.updateMany({
                        where: {
                            id: { in: journals.map((journal) => journal.id) },
                        },
                        data: {
                            status: 'VOIDED',
                            approvedById: userId,
                            approvedAt: new Date(),
                        },
                    });
                    await tx.payment.deleteMany({
                        where: { barterSettlementId: settlement.id },
                    });
                    const voided = await tx.barterSettlement.update({
                        where: { id: settlement.id },
                        data: {
                            status: BarterSettlementStatus.VOIDED,
                            voidedById: userId,
                            voidedAt: new Date(),
                            voidReason: input.reason.trim(),
                        },
                    });
                    await logActivity({
                        userId,
                        action: 'VOID_BARTER_SETTLEMENT',
                        entityType: 'BarterSettlement',
                        entityId: settlement.id,
                        details: input.reason.trim(),
                        fromStatus: BarterSettlementStatus.POSTED,
                        toStatus: BarterSettlementStatus.VOIDED,
                        tx,
                    });
                    return voided;
                },
                {
                    isolationLevel:
                        Prisma.TransactionIsolationLevel.Serializable,
                    timeout: 30_000,
                },
            ),
        );
    }
}
