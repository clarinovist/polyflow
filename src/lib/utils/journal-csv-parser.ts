import Papa from 'papaparse';
import { z } from 'zod';

export const importJournalSchema = z.object({
    Date: z.string(), // YYYY-MM-DD
    Reference: z.string(),
    Description: z.string(),
    AccountCode: z.string(),
    Debit: z.coerce.number().min(0),
    Credit: z.coerce.number().min(0)
});

export type ImportJournalRow = z.infer<typeof importJournalSchema>;

export async function parseJournalCSV(file: File): Promise<{ data: ImportJournalRow[]; errors: { row: number; error: z.ZodIssue[] }[] }> {
    return new Promise((resolve) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const parsedData: ImportJournalRow[] = [];
                const errors: { row: number; error: z.ZodIssue[] }[] = [];

                results.data.forEach((row: unknown, index) => {
                    const result = importJournalSchema.safeParse(row);
                    if (result.success) {
                        parsedData.push(result.data);
                    } else {
                        errors.push({ row: index + 2, error: result.error.issues });
                    }
                });

                resolve({ data: parsedData, errors });
            },
            error: (error) => {
                // PapaParse error is different, handle it as a row 0 error
                resolve({ data: [], errors: [{ row: 0, error: [{ code: 'custom', message: error.message, path: [] } as z.ZodIssue] }] });
            }
        });
    });
}
