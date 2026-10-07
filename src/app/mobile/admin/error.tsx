'use client';

import { useEffect } from 'react';
import { MobileErrorState } from '@/components/mobile';

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
    useEffect(() => {
        console.error('[Admin Mobile error boundary]', error);
    }, [error]);

    return (
        <MobileErrorState
            title="Admin Command Center mengalami kendala"
            message="Halaman tidak dapat ditampilkan. Tidak ada data yang diubah; coba lagi atau kembali melalui pemilih portal."
            onRetry={retry}
            headingLevel={1}
            className="rounded-xl border bg-card"
        />
    );
}
