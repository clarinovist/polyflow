import React from 'react';
import { getHrdMobileTeamAttendance, type HrdMobileTeamAttendanceFilters } from '@/actions/hrd/mobile-dashboard';
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
        status: (sp.status?.trim() || 'ALL') as HrdMobileTeamAttendanceFilters['status'],
        q: sp.q?.trim() || undefined,
    };

    const res = await getHrdMobileTeamAttendance(filters);
    const data = res.success ? res.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Rekap Absensi Karyawan" level={1} />
            <p className="text-xs text-slate-500">
                View-only HRD — filter tanggal, shift, status. Koreksi tetap via
                desktop HRD.
            </p>
            <HrdAttendanceClient initialData={data} initialFilters={filters} />
        </div>
    );
}
