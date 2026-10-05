export interface BulkShiftTemplate {
    id: string;
    name: string;
    /** HH:mm */
    startTime: string;
    /** HH:mm */
    endTime: string;
}

export interface BulkShiftRow {
    templateId: string;
    shiftName: string;
    start: Date;
    end: Date;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

function addDays(dateStr: string, offset: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + offset);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${dt.getFullYear()}-${mm}-${dd}`;
}

/**
 * Susun baris shift untuk N hari dari tanggal mulai (waktu lokal, semantik sama
 * dengan form tambah-shift satuan: end < start berarti lewat tengah malam).
 */
export function buildBulkShiftRows(
    startDate: string,
    dayCount: number,
    templates: BulkShiftTemplate[],
): BulkShiftRow[] {
    if (!DATE_RE.test(startDate)) throw new Error('Tanggal mulai tidak valid (YYYY-MM-DD).');
    if (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 31)
        throw new Error('Jumlah hari 1-31.');
    const rows: BulkShiftRow[] = [];
    for (let d = 0; d < dayCount; d++) {
        const ds = addDays(startDate, d);
        for (const t of templates) {
            if (!TIME_RE.test(t.startTime) || !TIME_RE.test(t.endTime))
                throw new Error(`Jam template ${t.name} tidak valid.`);
            const start = new Date(`${ds}T${t.startTime}`);
            const end = new Date(`${ds}T${t.endTime}`);
            if (end < start) end.setDate(end.getDate() + 1);
            rows.push({ templateId: t.id, shiftName: t.name, start, end });
        }
    }
    return rows;
}

/** Pisahkan baris yang sudah ada (cocok startTime persis) agar generate idempoten. */
export function partitionBulkShiftRows(
    rows: BulkShiftRow[],
    existingStartMs: Set<number> | number[],
): { fresh: BulkShiftRow[]; skipped: BulkShiftRow[] } {
    const set = existingStartMs instanceof Set ? existingStartMs : new Set(existingStartMs);
    const fresh: BulkShiftRow[] = [];
    const skipped: BulkShiftRow[] = [];
    for (const r of rows) {
        (set.has(r.start.getTime()) ? skipped : fresh).push(r);
    }
    return { fresh, skipped };
}
