// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetContext } = vi.hoisted(() => ({ mockGetContext: vi.fn() }));
vi.mock('@/actions/production/kiosk-packaging', () => ({
    getKioskPackagingContext: (...args: unknown[]) => mockGetContext(...args),
}));

import { useKioskPackagingContext } from '../useKioskPackagingContext';

beforeEach(() => mockGetContext.mockReset());

describe('useKioskPackagingContext', () => {
    it('does not load for SPKs without actual packaging', () => {
        const { result } = renderHook(() => useKioskPackagingContext('po-1', false));

        expect(result.current).toMatchObject({ context: null, isLoading: false, error: '' });
        expect(mockGetContext).not.toHaveBeenCalled();
    });

    it('loads the context and reloads on request', async () => {
        mockGetContext.mockResolvedValue({ success: true, data: { enabled: true } });
        const { result } = renderHook(() => useKioskPackagingContext('po-1', true));

        await waitFor(() => expect(result.current.context).toEqual({ enabled: true }));
        act(() => result.current.reload());
        await waitFor(() => expect(mockGetContext).toHaveBeenCalledTimes(2));
        expect(mockGetContext).toHaveBeenCalledWith('po-1');
    });

    it('reports the server message or a connection problem', async () => {
        mockGetContext.mockResolvedValueOnce({ success: false, error: 'Sesi operator berakhir.' });
        const { result } = renderHook(() => useKioskPackagingContext('po-1', true));
        await waitFor(() => expect(result.current.error).toBe('Sesi operator berakhir.'));

        mockGetContext.mockResolvedValueOnce({ success: false });
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.error).toMatch(/Gagal memuat data kemasan/));

        mockGetContext.mockRejectedValueOnce(new Error('offline'));
        act(() => result.current.reload());
        await waitFor(() => expect(result.current.isLoading).toBe(false));
        expect(result.current.error).toMatch(/Gagal memuat data kemasan/);
    });
});
