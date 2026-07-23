'use server';

import { withTenant } from "@/lib/core/tenant";
import { prisma } from "@/lib/core/prisma";
import { transactionWizardSchema, TransactionWizardValues } from "@/lib/schemas/transaction-wizard";
import { TRANSACTION_TYPES } from "@/lib/config/transaction-types";
import { AccountingService } from "@/services/accounting/accounting-service";
import { FixedAssetService } from "@/services/finance/fixed-asset-service";
import { ReferenceType, JournalStatus } from "@prisma/client";
import { requireAuth } from "@/lib/tools/auth-checks";
import { revalidatePath } from "next/cache";
import { recordCustomerPayment, recordSupplierPayment } from "../finance/finance";
import { logger } from "@/lib/config/logger";
import { safeAction, BusinessRuleError } from "@/lib/errors/errors";
import { resolveAccount } from "@/services/accounting/account-resolver";

export const createWizardTransaction = withTenant(
    async function createWizardTransaction(data: TransactionWizardValues) {
        return safeAction(async () => {
            const session = await requireAuth();

            const validation = transactionWizardSchema.safeParse(data);
            if (!validation.success) {
                throw new BusinessRuleError(validation.error.issues[0].message);
            }

            const config = TRANSACTION_TYPES.find(t => t.id === data.transactionTypeId);
            if (!config) {
                throw new BusinessRuleError("Tipe transaksi tidak valid");
            }

            if (config.blockedInQuickEntryReason) {
                throw new BusinessRuleError(config.blockedInQuickEntryReason);
            }

            try {
                if (config.requiresInvoice && data.invoiceId) {
                    // For invoice-linked transactions, resolve the target account
                    const isSales = config.requiresInvoice === 'SALES';
                    const targetAccountId = isSales ? data.customDebitAccountId : data.customCreditAccountId;

                    let bankAcc: { id: string; code: string; name: string } | null = null;
                    if (targetAccountId) {
                        bankAcc = await prisma.account.findUnique({ where: { id: targetAccountId } });
                    } else {
                        const resolved = await resolveAccount(isSales ? config.debitAccountRole : config.creditAccountRole);
                        bankAcc = await prisma.account.findUnique({ where: { id: resolved.id } });
                    }

                    // Cash only when the selected account is petty cash — not every isCashAccount
                    // (banks are also isCashAccount=true on both Kiyowo and Melindo COA).
                    const pettyCash = await resolveAccount('petty-cash').catch(() => null);
                    const isPettyCash =
                        !!bankAcc &&
                        (!!pettyCash
                            ? bankAcc.id === pettyCash.id
                            : /kas kecil|petty cash/i.test(bankAcc.name));
                    const method = isPettyCash ? 'Cash' : 'Bank Transfer';

                    if (isSales) {
                        const result = await recordCustomerPayment({
                            invoiceId: data.invoiceId,
                            amount: data.amount,
                            paymentDate: data.entryDate,
                            method,
                            notes: data.description
                        });
                        if (!result.success) throw new BusinessRuleError(result.error);
                        return { id: 'payment' };
                    } else {
                        const result = await recordSupplierPayment({
                            invoiceId: data.invoiceId,
                            amount: data.amount,
                            paymentDate: data.entryDate,
                            method,
                            notes: data.description
                        });
                        if (!result.success) throw new BusinessRuleError(result.error);
                        return { id: 'payment' };
                    }
                }

                // Resolve debit/credit accounts by role (tenant-aware)
                const debitAccountId = data.customDebitAccountId ||
                    (await resolveAccount(config.debitAccountRole)).id;
                const creditAccountId = data.customCreditAccountId ||
                    (await resolveAccount(config.creditAccountRole)).id;

                let referenceType = ReferenceType.MANUAL_ENTRY as ReferenceType;
                if (config.category === 'ASSET') referenceType = ReferenceType.GOODS_RECEIPT as ReferenceType;
                if (config.category === 'SALES') referenceType = ReferenceType.SALES_INVOICE as ReferenceType;

                const result = await AccountingService.createJournalEntry({
                    entryDate: data.entryDate,
                    description: data.description,
                    reference: data.reference ?? "",
                    referenceType,
                    createdById: session.user.id,
                    isAutoGenerated: false,
                    status: JournalStatus.POSTED,
                    lines: [
                        {
                            accountId: debitAccountId,
                            debit: data.amount,
                            credit: 0,
                            description: data.description
                        },
                        {
                            accountId: creditAccountId,
                            debit: 0,
                            credit: data.amount,
                            description: data.description
                        }
                    ]
                });

                if (config.category === 'ASSET' && data.assetCode) {
                    await FixedAssetService.createAsset({
                        assetCode: data.assetCode,
                        name: data.description,
                        category: config.label,
                        purchaseDate: data.entryDate,
                        purchaseValue: data.amount,
                        usefulLifeMonths: data.usefulLifeMonths || 48,
                        assetAccountId: debitAccountId,
                        depreciationAccountId: data.depreciationAccountId || "",
                        accumulatedDepreciationAccountId: data.accumulatedDepreciationAccountId || ""
                    });
                    revalidatePath('/finance/assets');
                }

                revalidatePath('/finance/journals');
                revalidatePath('/finance/reports/balance-sheet');
                revalidatePath('/finance/reports/trial-balance');
                revalidatePath('/finance');

                return { id: result.id };
            } catch (error) {
                if (error instanceof BusinessRuleError) throw error;
                logger.error("Wizard Transaction Error", { error, data, module: 'TransactionWizard' });
                throw new BusinessRuleError("Gagal mencatat transaksi");
            }
        });
    }
);
