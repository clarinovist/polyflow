'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Bar,
    CartesianGrid,
    ComposedChart,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { getHrdAttendanceTrend } from '@/actions/hrd/attendance-trend';
import {
    DEFAULT_TREND_RANGE_DAYS,
    TREND_RANGE_PRESETS,
    presetDateRange,
    type AttendanceTrendDay,
    type AttendanceTrendResult,
} from '@/services/hrd/attendance-trend';
import { todayWibDateString } from '@/services/hrd/shift-window';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import { AttendanceLoadError } from './AttendanceLoadError';
import type { WorkShift } from './attendance-recap-types';

const ALL_SHIFTS_VALUE = '__all__';

interface Props {
    shifts: WorkShift[];
    initialShiftId?: string;
}

function shortDateLabel(isoDate: string): string {
    const [, m, d] = isoDate.split('-');
    return `${d}/${m}`;
}

export function AttendanceTrendCard({ shifts, initialShiftId }: Props) {
    const [rangeDays, setRangeDays] = useState<number>(
        DEFAULT_TREND_RANGE_DAYS,
    );
    const [shiftId, setShiftId] = useState<string>(initialShiftId || '');
    const [data, setData] = useState<AttendanceTrendResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const requestSeq = useRef(0);

    const load = useCallback(async (days: number, selectedShift: string) => {
        const seq = ++requestSeq.current;
        setLoading(true);
        setError(null);
        const { from, to } = presetDateRange(days, todayWibDateString());
        try {
            const res = await getHrdAttendanceTrend({
                from,
                to,
                workShiftId: selectedShift || undefined,
            });
            if (seq !== requestSeq.current) return;
            if (!res.success) {
                setData(null);
                setError(res.error || 'Gagal memuat tren kehadiran tim');
            } else if (!res.data) {
                setData(null);
                setError('Gagal memuat tren kehadiran tim');
            } else {
                setData(res.data);
            }
        } catch {
            if (seq !== requestSeq.current) return;
            setData(null);
            setError('Gagal memuat tren kehadiran tim');
        } finally {
            if (seq === requestSeq.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        load(rangeDays, shiftId);
    }, [rangeDays, shiftId, load]);

    const activeShifts = shifts.filter(
        (s) => s.status === undefined || s.status === 'ACTIVE',
    );
    const hasRecords = Boolean(
        data?.days.some(
            (d) => d.present + d.onLeave + d.absent > 0,
        ),
    );

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2.5">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <div>
                            <CardTitle className="text-base">
                                Tren Kehadiran Tim
                            </CardTitle>
                            <p className="text-xs text-muted-foreground">
                                Hari kerja Senin–Sabtu (karyawan unik per hari)
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div
                            className="flex items-center rounded-lg bg-muted p-0.5"
                            role="group"
                            aria-label="Rentang hari tren"
                        >
                            {TREND_RANGE_PRESETS.map((preset) => (
                                <Button
                                    key={preset}
                                    type="button"
                                    size="sm"
                                    variant={
                                        rangeDays === preset
                                            ? 'default'
                                            : 'ghost'
                                    }
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => setRangeDays(preset)}
                                >
                                    {preset} hari
                                </Button>
                            ))}
                        </div>
                        <Select
                            value={shiftId || ALL_SHIFTS_VALUE}
                            onValueChange={(v) =>
                                setShiftId(v === ALL_SHIFTS_VALUE ? '' : v)
                            }
                        >
                            <SelectTrigger
                                className="h-8 w-[160px] text-xs"
                                aria-label="Filter shift tren"
                            >
                                <SelectValue placeholder="Semua shift" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL_SHIFTS_VALUE}>
                                    Semua shift
                                </SelectItem>
                                {activeShifts.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-4">
                {loading ? (
                    <p className="py-10 text-center text-xs text-muted-foreground">
                        Memuat tren kehadiran…
                    </p>
                ) : error ? (
                    <AttendanceLoadError
                        message={error}
                        onRetry={() => load(rangeDays, shiftId)}
                    />
                ) : !data || !hasRecords ? (
                    <p className="py-10 text-center text-xs text-muted-foreground">
                        Belum ada data kehadiran pada rentang ini.
                    </p>
                ) : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                            <div className="rounded-lg border p-2.5">
                                <div className="text-[10px] uppercase text-muted-foreground">
                                    Rata-rata Kehadiran
                                </div>
                                <div className="text-lg font-bold">
                                    {data.shiftFiltered ||
                                    data.averageRate === null
                                        ? '—'
                                        : `${data.averageRate}%`}
                                </div>
                            </div>
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                                <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400">
                                    Tepat waktu
                                </div>
                                <div className="text-lg font-bold">
                                    {data.totals.onTime}
                                </div>
                            </div>
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                                <div className="text-[10px] uppercase text-amber-700 dark:text-amber-400">
                                    {attendanceStatusLabel('LATE')}
                                </div>
                                <div className="text-lg font-bold">
                                    {data.totals.late}
                                </div>
                            </div>
                            <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5">
                                <div className="text-[10px] uppercase text-sky-700 dark:text-sky-400">
                                    {attendanceStatusLabel('ON_LEAVE')}
                                </div>
                                <div className="text-lg font-bold">
                                    {data.totals.onLeave}
                                </div>
                            </div>
                            <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5">
                                <div className="text-[10px] uppercase text-rose-700 dark:text-rose-400">
                                    {attendanceStatusLabel('ABSENT')}
                                </div>
                                <div className="text-lg font-bold">
                                    {data.totals.absent}
                                </div>
                            </div>
                            {!data.shiftFiltered && (
                                <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-2.5">
                                    <div className="text-[10px] uppercase text-orange-700 dark:text-orange-400">
                                        Tanpa catatan
                                    </div>
                                    <div className="text-lg font-bold">
                                        {data.totals.noRecord ?? 0}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={data.days}>
                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        vertical={false}
                                        opacity={0.25}
                                    />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={shortDateLabel}
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        yAxisId="count"
                                        allowDecimals={false}
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    {!data.shiftFiltered && (
                                        <YAxis
                                            yAxisId="rate"
                                            orientation="right"
                                            domain={[0, 100]}
                                            tickFormatter={(v) => `${v}%`}
                                            fontSize={11}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                    )}
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) {
                                                return null;
                                            }
                                            const row = payload[0]
                                                .payload as AttendanceTrendDay;
                                            return (
                                                <div className="rounded-lg border bg-background p-2.5 text-xs shadow-sm space-y-1">
                                                    <p className="font-semibold">
                                                        {row.date}
                                                    </p>
                                                    <p>
                                                        {attendanceStatusLabel(
                                                            'PRESENT',
                                                        )}
                                                        : {row.present} (Tepat:{' '}
                                                        {row.onTime},{' '}
                                                        {attendanceStatusLabel(
                                                            'LATE',
                                                        )}
                                                        : {row.late})
                                                    </p>
                                                    <p>
                                                        {attendanceStatusLabel(
                                                            'ON_LEAVE',
                                                        )}
                                                        : {row.onLeave}
                                                    </p>
                                                    <p>
                                                        {attendanceStatusLabel(
                                                            'ABSENT',
                                                        )}
                                                        : {row.absent}
                                                    </p>
                                                    {!data.shiftFiltered && (
                                                        <>
                                                            <p className="text-muted-foreground">
                                                                Tanpa catatan:{' '}
                                                                {row.noRecord ??
                                                                    0}
                                                            </p>
                                                            <p className="font-medium">
                                                                Kehadiran:{' '}
                                                                {row.attendanceRate !==
                                                                null
                                                                    ? `${row.attendanceRate}% (${row.present}/${row.eligibleHeadcount})`
                                                                    : '—'}
                                                            </p>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        }}
                                    />
                                    <Legend />
                                    <Bar
                                        yAxisId="count"
                                        dataKey="onTime"
                                        name="Tepat waktu"
                                        stackId="team"
                                        fill="#10b981"
                                    />
                                    <Bar
                                        yAxisId="count"
                                        dataKey="late"
                                        name={attendanceStatusLabel('LATE')}
                                        stackId="team"
                                        fill="#f59e0b"
                                    />
                                    <Bar
                                        yAxisId="count"
                                        dataKey="onLeave"
                                        name={attendanceStatusLabel('ON_LEAVE')}
                                        stackId="team"
                                        fill="#0ea5e9"
                                    />
                                    <Bar
                                        yAxisId="count"
                                        dataKey="absent"
                                        name={attendanceStatusLabel('ABSENT')}
                                        stackId="team"
                                        fill="#f43f5e"
                                        radius={[4, 4, 0, 0]}
                                    />
                                    {!data.shiftFiltered && (
                                        <Line
                                            yAxisId="rate"
                                            type="monotone"
                                            dataKey="attendanceRate"
                                            name="% Kehadiran"
                                            stroke="#2563eb"
                                            strokeWidth={2}
                                            dot={false}
                                            connectNulls
                                        />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>

                        <div className="space-y-1 text-[11px] text-muted-foreground">
                            {data.shiftFiltered ? (
                                <p>
                                    Filter shift aktif: menampilkan jumlah
                                    absolut per shift tanpa persentase kehadiran
                                    atau tanpa catatan.
                                </p>
                            ) : (
                                <p>
                                    Catatan pembagi: persentase kehadiran
                                    memakai karyawan berstatus ACTIVE saat ini
                                    dan tanggal masuk; karyawan yang sudah
                                    dinonaktifkan tidak ikut di pembagi tanggal
                                    lampau.
                                </p>
                            )}
                            <p>
                                Izin pada grafik tim dihitung dari catatan
                                absensi berstatus Izin (selaras dengan dashboard
                                HRD harian).
                            </p>
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
}
