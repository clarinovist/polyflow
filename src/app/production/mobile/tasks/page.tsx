import React from 'react';
import { getProductionSupervisorOverview } from '@/actions/production/mobile-supervisor';
import { MobileSectionHeader, MobileTaskCard } from '@/components/mobile';

export default async function ProductionTasksPage() {
    const response = await getProductionSupervisorOverview();
    const overview = response.success ? response.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Tugas & Status SPK" />

            {!overview || overview.recentOrders.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                    Tidak ada SPK aktif saat ini.
                </p>
            ) : (
                <div className="space-y-3">
                    {overview.recentOrders.map((order) => (
                        <MobileTaskCard
                            key={order.id}
                            id={order.id}
                            title={`SPK #${order.spkNumber}`}
                            subtitle={order.productName}
                            priority={
                                order.status === 'IN_PROGRESS' ? 'HIGH' : 'NORMAL'
                            }
                            href="/kiosk"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
