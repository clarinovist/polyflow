import { z } from "zod";

export const manualJournalSchema = z.object({
    entryDate: z.date(),
    description: z.string().min(3, "Description must be at least 3 characters"),
    reference: z.string().optional(),
    lines: z.array(z.object({
        accountId: z.string().min(1, "Account is required"),
        description: z.string().optional(),
        debit: z.coerce.number().min(0, "Debit must be positive"),
        credit: z.coerce.number().min(0, "Credit must be positive")
    })).min(2, "Journal must have at least 2 lines")
        .refine((lines) => {
            // Check if at least one line has non-zero value
            const hasValue = lines.some(l => l.debit > 0 || l.credit > 0);
            if (!hasValue) return false;

            const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
            const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);

            // Floating point safe comparison
            return Math.abs(totalDebit - totalCredit) < 0.01;
        }, "Journal is not balanced. Total Debit must equal Total Credit.")
});

export type ManualJournalValues = z.infer<typeof manualJournalSchema>;
