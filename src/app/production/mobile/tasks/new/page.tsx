import React from 'react';
import { getMobileQuickSpkFormData } from '@/actions/production/mobile-supervisor';
import { MobileSectionHeader } from '@/components/mobile';
import { QuickCreateClient } from './quick-create-client';

export default async function QuickCreateSpkPage() {
    const res = await getMobileQuickSpkFormData();
    const data = res.success ? res.data : null;

    return (
        <div className="space-y-4">
            <MobileSectionHeader title="Buat SPK Mendadak" />
            <p className="text-xs text-slate-500">
                Pakai business logic existing. SPK yang dibuat akan langsung terlihat di Kiosk untuk eksekusi operator.
            </p>
            {!data ? (
                <div className="rounded-lg border bg-white p-4 text-sm text-slate-500 dark:bg-slate-800 dark:border-slate-700">
                    Gagal memuat data form. Cek koneksi dan coba lagi. Pastikan ada BOM aktif dan mesin aktif.
                </div>
            ) : (
                <QuickCreateClient initialData={data} />
            )}
        </div>
    );
}
