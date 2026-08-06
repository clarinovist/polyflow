'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { MobileTeamAttendanceResult } from '@/actions/production/mobile-supervisor';
import { formatWIB } from '@/lib/utils/timezone';

function fmtTime(iso: string | null): string {
    if (!iso) return '-';
    try {
        return formatWIB(new Date(iso), 'HH:mm');
    } catch {
        return '-';
    }
}

interface Props {
    initialData: MobileTeamAttendanceResult | null;
    initialFilters: {
        date?: string;
        workShiftId?: string;
        status?: string;
        q?: string;
        role?: string;
    };
}

const STATUS_OPTIONS = [
    { value: 'ALL', label: 'Semua Status' },
    { value: 'PRESENT', label: 'Hadir' },
    { value: 'ABSENT', label: 'Tidak Hadir' },
    { value: 'ON_LEAVE', label: 'Cuti/Izin' },
    { value: 'NO_RECORD', label: 'Belum Absen' },
];

const ROLE_OPTIONS = [
    { value: 'ALL', label: 'Semua Role' },
    { value: 'OPERATOR', label: 'Operator' },
    { value: 'HELPER', label: 'Helper' },
    { value: 'PACKER', label: 'Packer' },
    { value: 'PRODUCTION', label: 'Production' },
];

export function AttendanceClient({ initialData, initialFilters }: Props) {
    const router = useRouter();
    const [date, setDate] = useState(
        initialFilters.date || initialData?.date || '',
    );
    const [shift, setShift] = useState(initialFilters.workShiftId || '');
    const [status, setStatus] = useState(initialFilters.status || 'ALL');
    const [q, setQ] = useState(initialFilters.q || '');
    const [role, setRole] = useState(initialFilters.role || 'ALL');

    const data = initialData;

    const applyFilters = () => {
        const params = new URLSearchParams();
        if (date) params.set('date', date);
        if (shift) params.set('shift', shift);
        if (status && status !== 'ALL') params.set('status', status);
        if (q.trim()) params.set('q', q.trim());
        if (role && role !== 'ALL') params.set('role', role);
        router.push(`/production/mobile/attendance?${params.toString()}`);
    };

    const summary = useMemo(() => {
        if (!data) return null;
        return {
            total: data.totalEmployees,
            present: data.presentCount,
            absent: data.absentCount,
            leave: data.onLeaveCount,
            noRecord: data.noRecordCount,
        };
    }, [data]);

    if (!data) {
        return (
            <div className="rounded-lg border bg-white p-4 text-sm text-slate-500 dark:bg-slate-800 dark:border-slate-700">
                Gagal memuat data absensi. Coba refresh.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Summary chips */}
            {summary && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-white p-3 border dark:bg-slate-800 dark:border-slate-700">
                        <div className="text-[11px] text-slate-500">
                            Total Karyawan
                        </div>
                        <div className="text-lg font-bold">{summary.total}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800">
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                            Hadir
                        </div>
                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                            {summary.present}
                        </div>
                    </div>
                    <div className="rounded-lg bg-red-50 p-3 border border-red-200 dark:bg-red-950/30 dark:border-red-800">
                        <div className="text-[11px] text-red-700 dark:text-red-300">
                            Tidak Hadir
                        </div>
                        <div className="text-lg font-bold text-red-700 dark:text-red-300">
                            {summary.absent + summary.noRecord}
                        </div>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                        <div className="text-[11px] text-amber-700 dark:text-amber-300">
                            Cuti/Izin
                        </div>
                        <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                            {summary.leave}
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="rounded-lg bg-white p-3 border space-y-3 dark:bg-slate-800 dark:border-slate-700">
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Tanggal
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                        />
                    </div>
                    <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Shift
                        </label>
                        <select
                            value={shift}
                            onChange={(e) => setShift(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                        >
                            <option value="">Semua Shift</option>
                            {data.shifts.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                        >
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Role
                        </label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                        >
                            {ROLE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                        Cari Nama/Kode
                    </label>
                    <input
                        type="text"
                        placeholder="Ketik nama atau kode..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                    />
                </div>

                <button
                    onClick={applyFilters}
                    className="w-full rounded-md bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                    Terapkan Filter
                </button>
            </div>

            {/* Records list */}
            <div className="space-y-2">
                {data.records.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-500">
                        Tidak ada data untuk filter ini.
                    </p>
                ) : (
                    data.records.map((rec) => (
                        <div
                            key={rec.employeeId}
                            className="rounded-lg border bg-white p-3 dark:bg-slate-800 dark:border-slate-700"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                            {rec.employeeName}
                                        </span>
                                        {rec.isLate && (
                                            <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                                                Terlambat
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        {rec.employeeCode} • {rec.employeeRole}{' '}
                                        {rec.shiftName
                                            ? `• ${rec.shiftName}`
                                            : ''}
                                    </div>
                                </div>
                                <span
                                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                        rec.status === 'PRESENT'
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                            : rec.status === 'ABSENT'
                                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                              : rec.status === 'ON_LEAVE'
                                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                    }`}
                                >
                                    {rec.status === 'PRESENT'
                                        ? 'Hadir'
                                        : rec.status === 'ABSENT'
                                          ? 'Absen'
                                          : rec.status === 'ON_LEAVE'
                                            ? 'Cuti'
                                            : 'Belum Absen'}
                                </span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                                <div>
                                    <div className="text-slate-500">Masuk</div>
                                    <div className="font-semibold">
                                        {fmtTime(rec.clockInAt)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500">Pulang</div>
                                    <div className="font-semibold">
                                        {fmtTime(rec.clockOutAt)}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-slate-500">
                                        Jam Kerja
                                    </div>
                                    <div className="font-semibold">
                                        {rec.actualHours != null
                                            ? `${rec.actualHours}h`
                                            : '-'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
