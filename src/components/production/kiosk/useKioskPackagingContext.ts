'use client';

import { useCallback, useEffect, useState } from 'react';
import { getKioskPackagingContext } from '@/actions/production/kiosk-packaging';
import type { KioskPackagingContext } from '@/lib/production/kiosk-packaging';

const LOAD_FAILED =
    'Gagal memuat data kemasan. Periksa koneksi lalu coba lagi.';

/** Packaging data for one SPK; loads only for SPKs that record actual packaging. */
export function useKioskPackagingContext(orderId: string, enabled: boolean) {
    const [context, setContext] = useState<KioskPackagingContext | null>(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        if (!enabled) return;
        let active = true;
        setIsLoading(true);
        setError('');
        getKioskPackagingContext(orderId)
            .then((result) => {
                if (!active) return;
                if (result.success) setContext(result.data);
                else setError(result.error || LOAD_FAILED);
            })
            .catch(() => {
                if (active) setError(LOAD_FAILED);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [orderId, enabled, reloadKey]);

    const reload = useCallback(() => setReloadKey((key) => key + 1), []);
    return { context, error, isLoading, reload };
}
