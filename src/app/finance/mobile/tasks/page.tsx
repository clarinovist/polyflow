import React from 'react';
import { getFinanceMobileOverview } from '@/actions/finance/mobile-dashboard';
import { MobileSectionHeader, MobileTaskCard } from '@/components/mobile';

export default async function FinanceTasksPage() {
    const response = await getFinanceMobileOverview();
    const overview = response.success ? response.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Faktur & Pengawasan Transaksi" />

            {!overview || overview.recentInvoices.length === 0 ? (
                <p className="text-sm text-slate-500 py-4">
                    Tidak ada faktur overdue saat ini.
                </p>
            ) : (
                <div className="space-y-3">
                    {overview.recentInvoices.map((inv) => (
                        <MobileTaskCard
                            key={inv.id}
                            id={inv.id}
                            title={`[${inv.type}] #${inv.invoiceNumber}`}
                            subtitle={`${inv.customerName} - Rp ${inv.amount.toLocaleString('id-ID')}`}
                            priority={inv.type === 'AP' ? 'URGENT' : 'HIGH'}
                            href="/finance"
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
