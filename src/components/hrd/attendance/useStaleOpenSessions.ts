'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listStaleOpenSessions } from '@/actions/admin/attendance';
import type { StaleOpenSessionList } from '@/services/hrd/attendance-query-service';

export type StaleSessionsState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: StaleOpenSessionList };

const LOAD_ERROR = 'Gagal memuat sesi belum pulang';

/**
 * Daftar sesi "lupa pulang" (lintas tanggal, 60 hari terakhir). `enabled=false`
 * tidak memanggil server. Respons usang diabaikan; gagal baca = state error,
 * bukan daftar kosong.
 */
export function useStaleOpenSessions(enabled: boolean) {
    const [state, setState] = useState<StaleSessionsState>({
        status: 'loading',
    });
    const latestRequest = useRef(0);

    const reload = useCallback(async () => {
        const requestId = ++latestRequest.current;
        setState({ status: 'loading' });
        try {
            const res = await listStaleOpenSessions();
            if (requestId !== latestRequest.current) return;
            setState(
                res.success && 'data' in res && res.data
                    ? { status: 'ready', data: res.data }
                    : {
                          status: 'error',
                          message: ('error' in res && res.error) || LOAD_ERROR,
                      },
            );
        } catch {
            if (requestId === latestRequest.current) {
                setState({ status: 'error', message: LOAD_ERROR });
            }
        }
    }, []);

    useEffect(() => {
        if (enabled) void reload();
    }, [enabled, reload]);

    return { state, reload };
}
