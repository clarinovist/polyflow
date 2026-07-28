import React from 'react';
import { getPurchasingMobileOverview } from '@/actions/purchasing/mobile-dashboard';
import { MobileSectionHeader, MobileTaskCard } from '@/components/mobile';

export default async function PurchasingTasksPage() {
    const response = await getPurchasingMobileOverview();
    const overview = response.success ? response.data : null;
    const recentOrders = overview?.recentOrders ?? [];

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Daftar Purchase Order" />

            {!recentOrders.length ? (
                <p className="text-sm text-slate-500 py-4">
                    Tidak ada PO aktif saat ini.
                </p>
            ) : (
                <div className="space-y-3">
                    {recentOrders.map((po) => (
                        <MobileTaskCard
                            key={po.id}
                            id={po.id}
                            title={`PO #${po.poNumber}`}
                            subtitle={po.supplierName}
                            priority={po.status === 'APPROVED' ? 'HIGH' : 'NORMAL'}
                            href="/purchasing"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
