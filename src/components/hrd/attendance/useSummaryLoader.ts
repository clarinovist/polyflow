'use client';

import { useCallback, useRef, useState } from 'react';

export interface SummaryFetchResult<T> {
    success: boolean;
    data?: T[];
    error?: string;
}

export interface SummaryLoaderState<T> {
    data: T[];
    loading: boolean;
    /** Pesan galat; null bila tidak ada. Gagal memuat ≠ data kosong. */
    error: string | null;
    load: (fetcher: () => Promise<SummaryFetchResult<T>>) => Promise<void>;
}

/**
 * Pemuat rekap (mingguan/bulanan) di sisi klien. Setiap muat memulai dari data
 * kosong supaya periode lama tidak tampil dengan label periode baru saat gagal,
 * mengubah kegagalan menjadi state error (bukan daftar kosong), dan mengabaikan
 * respons usang bila permintaan yang lebih baru sudah dikirim.
 */
export function useSummaryLoader<T>(fallbackError: string): SummaryLoaderState<T> {
    const [data, setData] = useState<T[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const latestRequest = useRef(0);

    const load = useCallback(
        async (fetcher: () => Promise<SummaryFetchResult<T>>) => {
            const requestId = ++latestRequest.current;
            setData([]);
            setError(null);
            setLoading(true);
            try {
                const res = await fetcher();
                if (requestId !== latestRequest.current) return;
                if (res.success) {
                    setData(res.data ?? []);
                } else {
                    setError(res.error || fallbackError);
                }
            } catch {
                if (requestId === latestRequest.current) {
                    setError(fallbackError);
                }
            } finally {
                if (requestId === latestRequest.current) setLoading(false);
            }
        },
        [fallbackError],
    );

    return { data, loading, error, load };
}
