/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { getHrdMobileTeamAttendance } from '@/actions/hrd/mobile-dashboard';
import { MobileSectionHeader } from '@/components/mobile';
import { HrdAttendanceClient } from './attendance-client';

type SearchParams = {
    date?: string;
    shift?: string;
    status?: string;
    q?: string;
};

export default async function HrdAttendancePage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const sp = await searchParams;
    const filters = {
        date: sp.date?.trim() || undefined,
        workShiftId: sp.shift?.trim() || undefined,
        status: (sp.status?.trim() as any) || 'ALL',
        q: sp.q?.trim() || undefined,
    };

    const res = await getHrdMobileTeamAttendance(filters as any);
    const data = res.success ? res.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Rekap Absensi Karyawan" />
            <p className="text-xs text-slate-500">
                View-only HRD — filter tanggal, shift, status. Koreksi tetap via
                desktop HRD.
            </p>
            <HrdAttendanceClient initialData={data} initialFilters={filters} />
        </div>
    );
}
