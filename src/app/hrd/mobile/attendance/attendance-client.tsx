'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HrdMobileTeamAttendanceResult } from '@/actions/hrd/mobile-dashboard';
import { formatWIB } from '@/lib/utils/timezone';

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
    initialData: HrdMobileTeamAttendanceResult | null;
    initialFilters: { date?: string; workShiftId?: string; status?: string; q?: string };
}) {
    const router = useRouter();
    const [date, setDate] = useState(initialFilters.date || initialData?.date || '');
    const [shift, setShift] = useState(initialFilters.workShiftId || '');
    const [status, setStatus] = useState(initialFilters.status || 'ALL');
    const [q, setQ] = useState(initialFilters.q || '');

    if (!initialData) {
        return <div className="rounded-lg border bg-white p-4 text-sm text-slate-500 dark:bg-slate-800">Gagal memuat data.</div>;
    }

    const data = initialData;

    const apply = () => {
        const params = new URLSearchParams();
        if (date) params.set('date', date);
        if (shift) params.set('shift', shift);
        if (status && status !== 'ALL') params.set('status', status);
        if (q.trim()) params.set('q', q.trim());
        router.push(`/hrd/mobile/attendance?${params.toString()}`);
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border bg-white p-2 dark:bg-slate-800 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Hadir</div>
                    <div className="font-bold text-emerald-600">{data.presentCount}</div>
                </div>
                <div className="rounded-lg border bg-white p-2 dark:bg-slate-800 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Absen</div>
                    <div className="font-bold text-red-600">{data.absentCount + data.noRecordCount}</div>
                </div>
                <div className="rounded-lg border bg-white p-2 dark:bg-slate-800 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Cuti</div>
                    <div className="font-bold text-amber-600">{data.onLeaveCount}</div>
                </div>
            </div>

            <div className="rounded-lg border bg-white p-3 space-y-2 dark:bg-slate-800 dark:border-slate-700">
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                    />
                    <select
                        value={shift}
                        onChange={(e) => setShift(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
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
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                    >
                        <option value="ALL">Semua Status</option>
                        <option value="PRESENT">Hadir</option>
                        <option value="ABSENT">Tidak Hadir</option>
                        <option value="ON_LEAVE">Cuti</option>
                        <option value="NO_RECORD">Belum Absen</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Cari nama/kode..."
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm dark:bg-slate-900 dark:border-slate-700"
                    />
                </div>
                <button onClick={apply} className="w-full rounded-md bg-violet-600 py-2 text-sm font-semibold text-white hover:bg-violet-700">
                    Terapkan
                </button>
            </div>

            <div className="space-y-2">
                {data.records.map((r) => (
                    <div key={r.employeeId} className="rounded-lg border bg-white p-3 dark:bg-slate-800 dark:border-slate-700">
                        <div className="flex justify-between gap-2">
                            <div>
                                <div className="text-sm font-semibold">
                                    {r.employeeName} {r.isLate ? <span className="ml-1 rounded bg-red-100 px-1 text-[10px] text-red-700">Terlambat</span> : null}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                    {r.employeeCode} • {r.employeeRole} {r.shiftName ? `• ${r.shiftName}` : ''}
                                </div>
                            </div>
                            <span className={`h-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700' : r.status === 'ABSENT' ? 'bg-red-100 text-red-700' : r.status === 'ON_LEAVE' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                                {r.status}
                            </span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                            <div>Masuk: {fmtTime(r.clockInAt)}</div>
                            <div>Pulang: {fmtTime(r.clockOutAt)}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
