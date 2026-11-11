// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listStaleOpenSessions } from '@/actions/admin/attendance';
import { useStaleOpenSessions } from '../useStaleOpenSessions';

vi.mock('@/actions/admin/attendance', () => ({
    listStaleOpenSessions: vi.fn(),
}));

const LIST = {
    truncated: false,
    sessions: [
        {
            id: 'r1',
            employeeId: 'e1',
            employeeName: 'Budi Contoh',
            employeeCode: 'E001',
            workDate: '2026-11-09',
            clockInAt: '2026-11-09T00:00:00.000Z',
            shift: { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00' },
            openHours: 30,
        },
    ],
};

describe('useStaleOpenSessions', () => {
    beforeEach(() => vi.clearAllMocks());

    it('does not fetch while disabled', () => {
        renderHook(() => useStaleOpenSessions(false));

        expect(listStaleOpenSessions).not.toHaveBeenCalled();
    });

    it('loads the list and exposes it as ready', async () => {
        vi.mocked(listStaleOpenSessions).mockResolvedValue({
            success: true,
            data: LIST,
        } as never);

        const { result } = renderHook(() => useStaleOpenSessions(true));

        expect(result.current.state.status).toBe('loading');
        await waitFor(() => expect(result.current.state.status).toBe('ready'));
        expect(result.current.state).toEqual({ status: 'ready', data: LIST });
    });

    it('exposes the server error (never an empty list) on failure', async () => {
        vi.mocked(listStaleOpenSessions).mockResolvedValue({
            success: false,
            error: 'Gagal memuat sesi belum pulang',
        } as never);

        const { result } = renderHook(() => useStaleOpenSessions(true));

        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toEqual({
            status: 'error',
            message: 'Gagal memuat sesi belum pulang',
        });
    });

    it('falls back to a generic message when success has no data', async () => {
        vi.mocked(listStaleOpenSessions).mockResolvedValue({
            success: true,
        } as never);

        const { result } = renderHook(() => useStaleOpenSessions(true));

        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toEqual({
            status: 'error',
            message: 'Gagal memuat sesi belum pulang',
        });
    });

    it('turns a thrown request into an error state', async () => {
        vi.mocked(listStaleOpenSessions).mockRejectedValue(new Error('net'));

        const { result } = renderHook(() => useStaleOpenSessions(true));

        await waitFor(() => expect(result.current.state.status).toBe('error'));
    });

    it('reloads on demand and recovers from an error', async () => {
        vi.mocked(listStaleOpenSessions)
            .mockResolvedValueOnce({ success: false, error: 'x' } as never)
            .mockResolvedValueOnce({ success: true, data: LIST } as never);
        const { result } = renderHook(() => useStaleOpenSessions(true));
        await waitFor(() => expect(result.current.state.status).toBe('error'));

        await act(async () => {
            result.current.reload();
        });

        await waitFor(() => expect(result.current.state.status).toBe('ready'));
        expect(listStaleOpenSessions).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale response when a newer reload finished first', async () => {
        let resolveFirst: (v: unknown) => void = () => undefined;
        vi.mocked(listStaleOpenSessions)
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }) as never,
            )
            .mockResolvedValueOnce({ success: true, data: LIST } as never);
        const { result } = renderHook(() => useStaleOpenSessions(true));

        await act(async () => {
            result.current.reload();
        });
        await waitFor(() => expect(result.current.state.status).toBe('ready'));
        await act(async () => {
            resolveFirst({ success: false, error: 'usang' });
        });

        expect(result.current.state.status).toBe('ready');
    });

    it('ignores a stale rejection after a newer reload', async () => {
        let rejectFirst: (e: unknown) => void = () => undefined;
        vi.mocked(listStaleOpenSessions)
            .mockReturnValueOnce(
                new Promise((_, reject) => {
                    rejectFirst = reject;
                }) as never,
            )
            .mockResolvedValueOnce({ success: true, data: LIST } as never);
        const { result } = renderHook(() => useStaleOpenSessions(true));

        await act(async () => {
            result.current.reload();
        });
        await waitFor(() => expect(result.current.state.status).toBe('ready'));
        await act(async () => {
            rejectFirst(new Error('usang'));
        });

        expect(result.current.state.status).toBe('ready');
    });
});
