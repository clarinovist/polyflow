import type { DetectorKey } from './detector-catalog';

/** Indonesian label per detector. The Record forces a label for every detector. */
const DETECTOR_LABELS: Record<DetectorKey, string> = {
    critical_stock: 'Stok kritis',
    stuck_so: 'Pesanan penjualan macet',
    overdue_ar: 'Piutang jatuh tempo',
    overdue_ap: 'Hutang jatuh tempo',
    missing_finance_journal: 'Jurnal keuangan belum lengkap',
    production_no_progress: 'SPK tanpa progres',
};

export function detectorLabel(detector: string): string {
    return Object.prototype.hasOwnProperty.call(DETECTOR_LABELS, detector)
        ? DETECTOR_LABELS[detector as DetectorKey]
        : detector;
}

export const SEVERITY_LABELS = {
    CRITICAL: 'Kritis',
    WARNING: 'Perhatian',
} as const;

const MS_PER_HOUR = 3_600_000;
const HOURS_PER_DAY = 24;
const MAX_HOURS_BEFORE_DAYS = 48;

/** "5 jam" below two days, otherwise "3 hari". Always positive. */
function formatSpan(ms: number): string {
    const hours = Math.max(1, Math.round(Math.abs(ms) / MS_PER_HOUR));
    if (hours < MAX_HOURS_BEFORE_DAYS) return `${hours} jam`;
    return `${Math.floor(hours / HOURS_PER_DAY)} hari`;
}

export type SlaDescription = {
    tone: 'none' | 'ok' | 'overdue';
    text: string;
};

/** Baseline findings have no SLA; the rest count down or show how late they are. */
export function describeSla(
    slaDueAt: string | null,
    now: Date,
): SlaDescription {
    if (!slaDueAt) return { tone: 'none', text: 'Tanpa SLA (tunggakan lama)' };
    const due = new Date(slaDueAt).getTime();
    if (Number.isNaN(due)) return { tone: 'none', text: 'Tanpa SLA' };
    const diff = due - now.getTime();
    if (diff >= 0) {
        return { tone: 'ok', text: `SLA sisa ${formatSpan(diff)}` };
    }
    return { tone: 'overdue', text: `Lewat SLA ${formatSpan(diff)}` };
}

/** Age of a detection as a bare span ("3 hari"), for summaries like "tertua 3 hari". */
export function describeAgeSpan(firstSeenAt: string, now: Date): string {
    const seen = new Date(firstSeenAt).getTime();
    if (Number.isNaN(seen)) return '';
    return formatSpan(now.getTime() - seen);
}

export function describeFirstSeen(firstSeenAt: string, now: Date): string {
    const seen = new Date(firstSeenAt).getTime();
    if (Number.isNaN(seen)) return '';
    const diff = now.getTime() - seen;
    if (diff < MS_PER_HOUR) return 'Terdeteksi baru saja';
    return `Terdeteksi ${formatSpan(diff)} lalu`;
}

const SNOOZE_DATE_FORMAT = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
});

export function describeSnooze(snoozedUntil: string | null): string {
    if (!snoozedUntil) return 'Ditunda';
    const until = new Date(snoozedUntil);
    if (Number.isNaN(until.getTime())) return 'Ditunda';
    return `Ditunda sampai ${SNOOZE_DATE_FORMAT.format(until)}`;
}
