import { z } from "zod";

export const transactionWizardSchema = z.object({
    transactionTypeId: z.string().min(1, "Transaction type is required"),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    entryDate: z.date(),
    description: z.string().min(3, "Description must be at least 3 characters"),
    reference: z.string().optional(),
    customDebitAccountId: z.string().optional(),
    customCreditAccountId: z.string().optional(),
    invoiceId: z.string().optional(),
    // Asset-specific fields
    assetCode: z.string().optional(),
    usefulLifeMonths: z.coerce.number().int().min(1).optional(),
    depreciationAccountId: z.string().optional(),
    accumulatedDepreciationAccountId: z.string().optional(),
}).refine((data) => {
    // If showAccountPicker is true (like in expense-other), customDebitAccountId must be present
    // We handle this logic in the component but safety first
    if (data.transactionTypeId === 'expense-other' && !data.customDebitAccountId) {
        return false;
    }
    return true;
}, {
    message: "Target account is required for this transaction type",
    path: ["customDebitAccountId"]
});

export type TransactionWizardValues = z.infer<typeof transactionWizardSchema>;
