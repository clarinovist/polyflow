import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

const STALE_SESSIONS_HREF = '/hrd/attendance?status=stale';

function formatWorkDate(dateKey: string): string {
    return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function StaleSessionsLink() {
    return (
        <Link href={STALE_SESSIONS_HREF} className="font-medium underline">
            Rekap Absensi → Sesi belum pulang
        </Link>
    );
}

/** Page-level warning above the weekly payroll table. */
export function IncompleteDaysSummaryNotice({
    employeeCount,
}: {
    employeeCount: number;
}) {
    if (employeeCount <= 0) return null;
    return (
        <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
        >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
                {employeeCount} karyawan harian punya hari tanpa jam pulang —
                upah hari tsb Rp0 sampai jam pulang dikoreksi; koreksi di{' '}
                <StaleSessionsLink />.
            </p>
        </div>
    );
}

/** Per-row marker in the weekly payroll table. */
export function IncompleteDaysBadge({ days }: { days?: number }) {
    if (!days || days <= 0) return null;
    return (
        <span className="ml-2 inline-block rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            {days} hari tanpa jam pulang
        </span>
    );
}

/** Per-employee warning with the affected dates (Employee 360 weekly tab). */
export function IncompleteDaysEmployeeNotice({ dates }: { dates?: string[] }) {
    if (!dates || dates.length === 0) return null;
    return (
        <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
        >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
                {dates.length} hari belum ada jam pulang (
                {dates.map(formatWorkDate).join(', ')}) — upah hari tsb Rp0
                sampai jam pulang dikoreksi; koreksi di <StaleSessionsLink />.
            </p>
        </div>
    );
}
