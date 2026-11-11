'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HrdMobileTeamAttendanceResult } from '@/actions/hrd/mobile-dashboard';
import { formatWIB } from '@/lib/utils/timezone';
import { attendanceStatusLabel } from '@/lib/hrd/attendance-status-label';
import {
    ATTENDANCE_STATUS_FILTERS,
    attendanceFilterLabel,
    buildAttendanceHref,
    describePageRange,
    employeeRoleLabel,
} from '@/components/hrd/mobile/attendance-filters';

const SUMMARY_TILES = [
    { status: 'PRESENT', field: 'presentCount', tone: 'text-emerald-600' },
    { status: 'LATE', field: 'lateCount', tone: 'text-red-600' },
    { status: 'ON_LEAVE', field: 'onLeaveCount', tone: 'text-amber-600' },
    { status: 'ABSENT', field: 'absentCount', tone: 'text-red-600' },
    { status: 'NO_RECORD', field: 'noRecordCount', tone: '' },
] as const satisfies ReadonlyArray<{
    status: string;
    field: keyof HrdMobileTeamAttendanceResult;
    tone: string;
}>;

function fmtTime(iso: string | null): string {
    if (!iso) return '-';
    try {
        return formatWIB(new Date(iso), 'HH:mm');
    } catch {
        return '-';
    }
}

export function HrdAttendanceClient({
    initialData,
    initialFilters,
}: {
    initialData: HrdMobileTeamAttendanceResult;
    initialFilters: {
        date?: string;
        workShiftId?: string;
        status?: string;
        q?: string;
    };
}) {
    const router = useRouter();
    const [date, setDate] = useState(
        initialFilters.date || initialData?.date || '',
    );
    const [shift, setShift] = useState(initialFilters.workShiftId || '');
    const [status, setStatus] = useState(initialFilters.status || 'ALL');
    const [q, setQ] = useState(initialFilters.q || '');

    const data = initialData;
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? data.records.length;
    const pageCount = data.pageCount ?? 1;

    // Changing filters always restarts from page 1.
    const apply = () =>
        router.push(
            buildAttendanceHref(
                { date, workShiftId: shift, status, q },
                1,
            ),
        );
    // Paging keeps the filters that are actually applied, not unsent edits.
    const goToPage = (target: number) =>
        router.push(buildAttendanceHref(initialFilters, target));

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                {SUMMARY_TILES.filter(
                    (tile) =>
                        !(data.isNonWorkingDay && tile.status === 'NO_RECORD'),
                ).map((tile) => (
                    <div
                        key={tile.status}
                        className="rounded-lg border bg-card p-2"
                    >
                        <div className="text-xs text-muted-foreground">
                            {attendanceStatusLabel(tile.status)}
                        </div>
                        <div className={`font-bold ${tile.tone}`}>
                            {data[tile.field] ?? 0}
                        </div>
                    </div>
                ))}
            </div>

            <div className="rounded-lg border bg-card p-3 space-y-2 [&_input]:min-h-11 [&_select]:min-h-11 [&_button]:min-h-11">
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="date"
                        aria-label="Tanggal absensi"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm"
                    />
                    <select
                        aria-label="Shift"
                        value={shift}
                        onChange={(e) => setShift(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm"
                    >
                        <option value="">Semua Shift</option>
                        {data.shifts.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <select
                        aria-label="Status absensi"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm"
                    >
                        {ATTENDANCE_STATUS_FILTERS.map((value) => (
                            <option key={value} value={value}>
                                {attendanceFilterLabel(value)}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        aria-label="Cari nama atau kode karyawan"
                        placeholder="Cari nama/kode..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm"
                    />
                </div>
                <button
                    onClick={apply}
                    className="w-full rounded-md bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-700"
                >
                    Terapkan
                </button>
            </div>

            <p className="text-xs text-muted-foreground">
                Ringkasan di atas dihitung dari seluruh karyawan pada tanggal
                ini. Belum absen bukan berarti tidak hadir; shift mungkin
                belum dimulai. Terlambat memakai jam mulai shift dan toleransi
                keterlambatan HRD.
            </p>
            {data.isNonWorkingDay ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs font-semibold">
                    Hari libur (Minggu)
                </p>
            ) : null}
            <div
                className="flex items-center justify-between gap-2 text-xs [&_button]:min-h-11"
                aria-label="Halaman rekap"
            >
                <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    className="rounded-md border px-3 disabled:opacity-50"
                >
                    Sebelumnya
                </button>
                <span>
                    {describePageRange(
                        page,
                        pageSize,
                        data.returned ?? data.records.length,
                        data.totalEmployees,
                    )}
                </span>
                <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= pageCount}
                    className="rounded-md border px-3 disabled:opacity-50"
                >
                    Berikutnya
                </button>
            </div>
            <div className="space-y-2">
                {!data.records.length && (
                    <p className="text-sm">
                        Tidak ada karyawan untuk filter ini.
                    </p>
                )}
                {data.records.map((r) => (
                    <div
                        key={r.employeeId}
                        className="rounded-lg border bg-card p-3"
                    >
                        <div className="flex justify-between gap-2">
                            <div>
                                <div className="text-sm font-semibold">
                                    {r.employeeName}{' '}
                                    {r.isLate ? (
                                        <span className="ml-1 rounded bg-red-100 px-1 text-xs text-red-700">
                                            {attendanceStatusLabel('LATE')}
                                        </span>
                                    ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    {r.employeeCode} • {employeeRoleLabel(r.employeeRole)}{' '}
                                    {r.shiftName ? `• ${r.shiftName}` : ''}
                                </div>
                            </div>
                            <span
                                className={`h-fit rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : r.status === 'ABSENT' ? 'bg-red-100 text-red-700' : r.status === 'ON_LEAVE' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}
                            >
                                {attendanceStatusLabel(r.status)}
                            </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>Masuk: {fmtTime(r.clockInAt)}</div>
                            <div>Pulang: {fmtTime(r.clockOutAt)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
