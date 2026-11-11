import React from 'react';
import { getHrdMobileTeamAttendance } from '@/actions/hrd/mobile-dashboard';
import { parseAttendanceStatus } from '@/components/hrd/mobile/attendance-filters';
import { HrdReadError } from '@/components/hrd/mobile/HrdReadError';
import { MobileDataFreshness, MobileSectionHeader } from '@/components/mobile';
import { HrdAttendanceClient } from './attendance-client';

type SearchParams = {
    date?: string;
    shift?: string;
    status?: string;
    q?: string;
    page?: string;
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
        status: parseAttendanceStatus(sp.status?.trim()),
        q: sp.q?.trim() || undefined,
        page: sp.page?.trim() || undefined,
    };

    const res = await getHrdMobileTeamAttendance(filters);
    if (!res.success)
        return (
            <HrdReadError
                title="Rekap absensi belum tersedia"
                message={res.error}
            />
        );
    const data = res.data;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Rekap Absensi Karyawan" level={1} />
            <MobileDataFreshness generatedAt={data.generatedAt} />
            <p className="text-xs text-muted-foreground">
                Hanya untuk dilihat: filter tanggal, shift, dan status. Koreksi
                tetap lewat HRD desktop.
            </p>
            <HrdAttendanceClient initialData={data} initialFilters={filters} />
        </div>
    );
}
