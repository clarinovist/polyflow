// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listNoRecordAttendance } from '@/actions/admin/attendance';
import { useNoRecordRoster } from '../useNoRecordRoster';

vi.mock('@/actions/admin/attendance', () => ({
    listNoRecordAttendance: vi.fn(),
}));

const ROSTER = {
    isNonWorkingDay: false,
    employees: [
        { employeeId: 'e-1', name: 'Budi Contoh', code: 'E001', assignedShift: null },
    ],
};

describe('useNoRecordRoster', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does not fetch while disabled', () => {
        renderHook(() => useNoRecordRoster('2026-11-10', false));

        expect(listNoRecordAttendance).not.toHaveBeenCalled();
    });

    it('loads the roster for the date', async () => {
        vi.mocked(listNoRecordAttendance).mockResolvedValue({
            success: true,
            data: ROSTER,
        } as never);

        const { result } = renderHook(() =>
            useNoRecordRoster('2026-11-10', true),
        );

        expect(result.current.state.status).toBe('loading');
        await waitFor(() => expect(result.current.state.status).toBe('ready'));
        expect(listNoRecordAttendance).toHaveBeenCalledWith('2026-11-10');
        expect(result.current.state).toEqual({ status: 'ready', data: ROSTER });
    });

    it('exposes an error state (never an empty roster) when loading fails', async () => {
        vi.mocked(listNoRecordAttendance).mockResolvedValue({
            success: false,
            error: 'Gagal memuat daftar belum absen',
        } as never);

        const { result } = renderHook(() =>
            useNoRecordRoster('2026-11-10', true),
        );

        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toEqual({
            status: 'error',
            message: 'Gagal memuat daftar belum absen',
        });
    });

    it('turns a thrown request into an error state', async () => {
        vi.mocked(listNoRecordAttendance).mockRejectedValue(new Error('net'));

        const { result } = renderHook(() =>
            useNoRecordRoster('2026-11-10', true),
        );

        await waitFor(() => expect(result.current.state.status).toBe('error'));
    });

    it('reloads on demand and recovers from an error', async () => {
        vi.mocked(listNoRecordAttendance)
            .mockResolvedValueOnce({ success: false, error: 'x' } as never)
            .mockResolvedValueOnce({ success: true, data: ROSTER } as never);
        const { result } = renderHook(() =>
            useNoRecordRoster('2026-11-10', true),
        );
        await waitFor(() => expect(result.current.state.status).toBe('error'));

        await act(async () => {
            result.current.reload();
        });

        await waitFor(() => expect(result.current.state.status).toBe('ready'));
    });

    it('refetches when the date changes', async () => {
        vi.mocked(listNoRecordAttendance).mockResolvedValue({
            success: true,
            data: ROSTER,
        } as never);
        const { result, rerender } = renderHook(
            ({ date }) => useNoRecordRoster(date, true),
            { initialProps: { date: '2026-11-10' } },
        );
        await waitFor(() => expect(result.current.state.status).toBe('ready'));

        rerender({ date: '2026-11-11' });

        await waitFor(() =>
            expect(listNoRecordAttendance).toHaveBeenLastCalledWith('2026-11-11'),
        );
    });
});
