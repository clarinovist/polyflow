import { z } from 'zod';
import { getWibDayBounds, parseBusinessDate } from '@/lib/utils/timezone';

const dateOnly = z.string().refine(value => {
    try { parseBusinessDate(value); return true; } catch { return false; }
}, 'Tanggal kalender harus valid dalam format YYYY-MM-DD');

export const financeRangeSchema = z.object({
    startDate: dateOnly.describe('Tanggal awal YYYY-MM-DD, inklusif WIB (Asia/Jakarta); rentang maksimal 366 hari.'),
    endDate: dateOnly.describe('Tanggal akhir YYYY-MM-DD, inklusif WIB (Asia/Jakarta), tidak sebelum tanggal awal.'),
}).strict().refine(value => {
    const start = Date.parse(value.startDate);
    const end = Date.parse(value.endDate);
    return end >= start && end - start <= 365 * 86_400_000;
}, 'Rentang tanggal harus berurutan dan maksimal 366 hari inklusif');

export const invoiceSearchSchema = z.object({
    searchTerm: z.string().trim().min(1).max(120).describe('Nomor/id invoice persis diutamakan; pencarian sebagian atau nama customer dapat memerlukan klarifikasi.'),
}).strict();

export function financeRange(input: unknown) {
    const dates = financeRangeSchema.parse(input);
    return { ...dates, start: getWibDayBounds(dates.startDate).startOfDay, end: getWibDayBounds(dates.endDate).endOfDay };
}
