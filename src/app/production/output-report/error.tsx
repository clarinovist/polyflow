'use client';

import { Button } from '@/components/ui/button';

export default function OutputReportError({ reset }: { reset: () => void }) {
    return (
        <div role="alert" className="rounded-xl border p-6 space-y-3">
            <h2 className="font-semibold">
                Rekap hasil produksi belum dapat dimuat.
            </h2>
            <p className="text-sm text-muted-foreground">
                Terjadi kesalahan saat mengambil data. Ini bukan berarti hasil
                produksi nol.
            </p>
            <Button onClick={reset}>Coba lagi</Button>
        </div>
    );
}
