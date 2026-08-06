/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { getMobileTeamAttendance } from '@/actions/production/mobile-supervisor';
import { MobileSectionHeader } from '@/components/mobile';
import { AttendanceClient } from './attendance-client';

type SearchParams = {
    date?: string;
    shift?: string;
    status?: string;
    q?: string;
    role?: string;
};

export default async function ProductionAttendancePage({
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
        role: sp.role?.trim() || 'ALL',
    };

    const response = await getMobileTeamAttendance(filters as any);
    const data = response.success ? response.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Absensi Produksi Hari Ini" />
            <p className="text-xs text-slate-500">
                View-only. Supervisor melihat jam masuk, jam pulang, status, dan
                indikator terlambat. Koreksi absensi tetap via HRD desktop.
            </p>
            <AttendanceClient initialData={data} initialFilters={filters} />
        </div>
    );
}
