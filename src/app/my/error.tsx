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
        console.error('[Portal karyawan error boundary]', error);
    }, [error]);

    return (
        <MobileErrorState
            title="Portal karyawan mengalami kendala"
            message="Halaman tidak dapat ditampilkan. Data Anda tidak diubah; coba lagi sebentar lagi."
            onRetry={retry}
            headingLevel={1}
            className="rounded-xl border bg-card"
        />
    );
}
