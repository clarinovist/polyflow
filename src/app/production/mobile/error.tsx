'use client';

import { useEffect } from 'react';
import { MobileErrorState } from '@/components/mobile';

export default function Error({
    error,
    retry,
}: {
    error: Error & { digest?: string };
    retry: () => void;
}) {
    useEffect(() => {
        console.error('[Produksi Mobile error boundary]', error);
    }, [error]);

    return (
        <MobileErrorState
            title="Produksi Mobile mengalami kendala"
            message="Halaman tidak dapat ditampilkan. Data Anda tidak diubah; coba lagi atau kembali melalui navigasi portal."
            onRetry={retry}
            headingLevel={1}
            className="rounded-xl border bg-card"
        />
    );
}
