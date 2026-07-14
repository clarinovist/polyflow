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

// --- Detail Journal Schema (generic, template-driven) ---

const journalDetailLineSchema = z.object({
    description: z.string().min(1, "Nama wajib diisi"),
    amount: z.coerce.number().positive("Nominal harus lebih dari 0"),
});

export const detailJournalSchema = z.object({
    type: z.string().min(1, "Template wajib dipilih"),
    entryDate: z.date(),
    description: z.string().min(3, "Description must be at least 3 characters"),
    reference: z.string().optional(),
    primaryAccountId: z.string().min(1, "Akun utama wajib dipilih"),
    counterAccountId: z.string().min(1, "Akun lawan wajib dipilih"),
    direction: z.enum(['OUTFLOW', 'INFLOW']).default('OUTFLOW'),
    details: z.array(journalDetailLineSchema)
        .min(1, "Minimal 1 detail")
        .refine((details) => {
            const total = details.reduce((sum, d) => sum + (d.amount || 0), 0);
            return total > 0;
        }, "Total nominal harus lebih dari 0"),
});

export type DetailJournalValues = z.infer<typeof detailJournalSchema>;

// --- Backward-compatible aliases (BTKL uses the same shape) ---

export type DirectLaborJournalValues = {
    entryDate: Date;
    description: string;
    reference?: string;
    debitAccountId: string;
    creditAccountId: string;
    details: { description: string; amount: number }[];
};

export const directLaborJournalSchema = z.object({
    entryDate: z.date(),
    description: z.string().min(3, "Description must be at least 3 characters"),
    reference: z.string().optional(),
    debitAccountId: z.string().min(1, "Akun biaya wajib dipilih"),
    creditAccountId: z.string().min(1, "Akun pembayaran wajib dipilih"),
    details: z.array(journalDetailLineSchema)
        .min(1, "Minimal 1 detail pekerja")
        .refine((details) => {
            const total = details.reduce((sum, d) => sum + (d.amount || 0), 0);
            return total > 0;
        }, "Total nominal harus lebih dari 0"),
});
