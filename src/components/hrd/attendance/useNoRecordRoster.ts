'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { listNoRecordAttendance } from '@/actions/admin/attendance';
import type { NoRecordRoster } from '@/services/hrd/attendance-roster-service';

export type NoRecordRosterState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; data: NoRecordRoster };

const LOAD_ERROR = 'Gagal memuat daftar belum absen';

/**
 * Daftar karyawan "Belum absen" untuk satu tanggal. `enabled=false` (mode
 * mingguan/bulanan) tidak memanggil server. Respons usang diabaikan.
 */
export function useNoRecordRoster(workDate: string, enabled: boolean) {
    const [state, setState] = useState<NoRecordRosterState>({
        status: 'loading',
    });
    const latestRequest = useRef(0);

    const reload = useCallback(async () => {
        const requestId = ++latestRequest.current;
        setState({ status: 'loading' });
        try {
            const res = await listNoRecordAttendance(workDate);
            if (requestId !== latestRequest.current) return;
            setState(
                res.success && res.data
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
    }, [workDate]);

    useEffect(() => {
        if (enabled) void reload();
    }, [enabled, reload]);

    return { state, reload };
}
