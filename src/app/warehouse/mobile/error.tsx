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
        console.error('[Gudang Mobile error boundary]', error);
    }, [error]);

    return (
        <MobileErrorState
            title="Gudang Mobile mengalami kendala"
            message="Halaman tidak dapat ditampilkan. Data Anda tidak diubah; coba lagi atau kembali melalui navigasi portal."
            onRetry={retry}
            headingLevel={1}
            className="rounded-xl border bg-card"
        />
    );
}
