'use client';

import { MobileErrorState } from '@/components/mobile/MobileErrorState';

export default function ProductionError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    return (
        <MobileErrorState
            title="Data produksi belum dapat dimuat"
            message="Halaman gagal dimuat. Kondisi ini bukan berarti data kosong atau stok nol. Coba lagi untuk memperbarui data."
            headingLevel={1}
            onRetry={retry}
            className="rounded-xl border bg-card"
        />
    );
}
