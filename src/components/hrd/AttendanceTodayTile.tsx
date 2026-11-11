import Link from 'next/link';
import type { HrdShiftBoard } from '@/actions/hrd/dashboard-kpis';
import { InfoHint } from '@/components/common/InfoHint';
import { DashboardSectionState } from '@/components/dashboard/DashboardMetricPrimitives';
import { HrdRetryButton } from '@/components/hrd/HrdRetryButton';
import { Card, CardContent } from '@/components/ui/card';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';

type AttendanceTodaySection = HrdShiftBoard['health']['attendanceToday'];
type AttendanceTodayData = NonNullable<AttendanceTodaySection['data']>;

interface AttendanceTodayTileProps {
    section: AttendanceTodaySection;
    /** WIB business date, YYYY-MM-DD. */
    workDate: string;
}

interface TileRow {
    key: string;
    label: string;
    value: number;
    /** Recap filter (shared contract with the recap page); omitted = whole day. */
    filter?: 'late' | 'leave' | 'absent' | 'norecord' | 'outside' | 'nophoto';
    note?: string;
    isAnomaly?: boolean;
}

const HOLIDAY_LABEL = 'Hari libur (Minggu)';
const STALE_HREF = '/hrd/attendance?status=stale';
const STALE_LABEL = 'Sesi belum pulang';
const STALE_HINT =
    'Upah hari itu Rp0 sampai jam pulang dikoreksi di Rekap Absensi.';

function recapHref(workDate: string, filter?: TileRow['filter']): string {
    const status = filter ? 'status=' + filter + '&' : '';
    return '/hrd/attendance?' + status + 'date=' + workDate;
}

function formatHours(value: number): string {
    return value.toLocaleString('id-ID', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    });
}

function buildRows(data: AttendanceTodayData): TileRow[] {
    const rows: TileRow[] = [
        {
            key: 'present',
            label: attendanceStatusLabel('PRESENT'),
            value: data.present,
        },
        {
            key: 'late',
            label: attendanceStatusLabel('LATE'),
            value: data.late,
            filter: 'late',
            note: 'termasuk dalam Hadir',
        },
        {
            key: 'leave',
            label: attendanceStatusLabel('ON_LEAVE'),
            value: data.onLeave,
            filter: 'leave',
        },
        {
            key: 'absent',
            label: 'Alfa tercatat',
            value: data.absent,
            filter: 'absent',
        },
    ];
    if (!data.isNonWorkingDay) {
        rows.push({
            key: 'norecord',
            label: attendanceStatusLabel('NO_RECORD'),
            value: data.noRecord,
            filter: 'norecord',
        });
    }
    return rows;
}

function buildAnomalyRows(data: AttendanceTodayData): TileRow[] {
    const anomalies: TileRow[] = [
        {
            key: 'outside',
            label: 'Di luar radius',
            value: data.outsideRadius,
            filter: 'outside',
            isAnomaly: true,
        },
        {
            key: 'nophoto',
            label: 'Tanpa selfie',
            value: data.noSelfie,
            filter: 'nophoto',
            isAnomaly: true,
        },
    ];
    return anomalies.filter((row) => row.value > 0);
}

function TileRowLink({ row, workDate }: { row: TileRow; workDate: string }) {
    return (
        <li>
            <Link
                href={recapHref(workDate, row.filter)}
                className={
                    'flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                    (row.isAnomaly ? 'text-amber-700 dark:text-amber-400' : '')
                }
            >
                <span className="min-w-0">
                    {row.label}
                    {row.note && (
                        <>
                            {' '}
                            <span className="ml-1 text-xs text-muted-foreground">
                                ({row.note})
                            </span>
                        </>
                    )}
                </span>{' '}
                <span className="font-semibold tabular-nums">{row.value}</span>
            </Link>
        </li>
    );
}

function StaleSessionRow({ count }: { count: number }) {
    return (
        <li>
            <Link
                href={STALE_HREF}
                title={STALE_HINT}
                className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-amber-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
            >
                <span className="min-w-0">
                    {STALE_LABEL}
                    <span className="ml-1 block text-xs text-muted-foreground">
                        {count} karyawan belum pulang lebih dari 20 jam. {STALE_HINT}
                    </span>
                </span>
                <span className="font-semibold tabular-nums">{count}</span>
            </Link>
        </li>
    );
}

function HolidayRow() {
    return (
        <li className="flex min-h-11 items-center px-2 py-1.5 text-sm text-muted-foreground">
            {HOLIDAY_LABEL}
        </li>
    );
}

function TileHeader({ workDate }: { workDate: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className="text-lg font-semibold">
                    Status absensi hari ini
                </h2>
                <p className="text-xs text-muted-foreground">
                    Hari kerja WIB {workDate} · karyawan unik
                </p>
            </div>
            <InfoHint label="Penjelasan Status absensi hari ini">
                <p>
                    Satu karyawan dihitung satu kali. Terlambat memakai
                    toleransi keterlambatan dari pengaturan absensi dan termasuk
                    dalam Hadir. Belum absen adalah karyawan aktif tanpa catatan
                    absensi pada hari kerja (Senin–Sabtu).
                </p>
            </InfoHint>
        </div>
    );
}

function UnavailableTile() {
    return (
        <div className="space-y-3">
            <DashboardSectionState
                state="UNAVAILABLE"
                title="Status absensi hari ini tidak tersedia"
                description="Data absensi gagal dimuat. Angka kosong tidak dianggap nol."
            />
            <HrdRetryButton />
        </div>
    );
}

export function AttendanceTodayTile({
    section,
    workDate,
}: AttendanceTodayTileProps) {
    if (section.status === 'NOT_CONFIGURED') {
        return (
            <DashboardSectionState
                state="NOT_CONFIGURED"
                title="Belum disiapkan"
                description="Status absensi hari ini belum dikonfigurasi."
            />
        );
    }
    if (section.status === 'UNAVAILABLE') return <UnavailableTile />;

    const { data } = section;
    const rows = [...buildRows(data), ...buildAnomalyRows(data)];

    return (
        <Card className="min-w-0 gap-0 py-0 shadow-sm">
            <CardContent className="space-y-3 p-4 sm:p-5">
                <TileHeader workDate={workDate} />
                <ul
                    aria-label="Status absensi hari ini"
                    className="space-y-0.5"
                >
                    {rows.map((row) => (
                        <TileRowLink
                            key={row.key}
                            row={row}
                            workDate={workDate}
                        />
                    ))}
                    {data.isNonWorkingDay && <HolidayRow />}
                    {data.staleOpen > 0 && (
                        <StaleSessionRow count={data.staleOpen} />
                    )}
                </ul>
                <p className="text-xs text-muted-foreground">
                    {formatHours(data.overtimeHours)} jam lembur pada catatan
                    hadir
                </p>
            </CardContent>
        </Card>
    );
}
