import { z } from 'zod';
import { parseBusinessDate, toBusinessDateString } from '@/lib/utils/timezone';

export function getProductionOutputDateError(value: string, now: Date): string | null {
    try {
        parseBusinessDate(value);
    } catch {
        return 'Tanggal produksi tidak valid.';
    }
    return value > toBusinessDateString(now)
        ? 'Tanggal produksi tidak boleh melebihi hari ini (WIB).'
        : null;
}

/** Explicit WO output date; independent of the browser/server local timezone. */
export const productionOutputDateSchema = z.string().superRefine((value, ctx) => {
    const message = getProductionOutputDateError(value, new Date());
    if (message) ctx.addIssue({ code: 'custom', message });
});
