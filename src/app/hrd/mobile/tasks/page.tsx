import React from 'react';
import { getHrdMobileOverview } from '@/actions/hrd/mobile-dashboard';
import { MobileSectionHeader, MobileTaskCard } from '@/components/mobile';

export default async function HrdTasksPage() {
    const response = await getHrdMobileOverview();
    const overview = response.success ? response.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Pengajuan Cuti Karyawan" />

            {!overview || overview.pendingLeaves.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                    Tidak ada pengajuan cuti pending saat ini.
                </p>
            ) : (
                <div className="space-y-3">
                    {overview.pendingLeaves.map((leave) => (
                        <MobileTaskCard
                            key={leave.id}
                            id={leave.id}
                            title={`${leave.employeeName} — ${leave.leaveType}`}
                            subtitle={`Tanggal: ${new Date(leave.startDate).toLocaleDateString('id-ID')} - ${new Date(leave.endDate).toLocaleDateString('id-ID')}`}
                            priority="HIGH"
                            href="/hrd"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
