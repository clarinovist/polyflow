// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSummaryLoader } from '../useSummaryLoader';

type Row = { id: string };
const FALLBACK = 'Gagal memuat rekap';
const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
};

describe('useSummaryLoader', () => {
    it('starts empty and idle', () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));

        expect(result.current).toMatchObject({
            data: [],
            loading: false,
            error: null,
        });
    });

    it('loads data on success', async () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));

        await act(() =>
            result.current.load(async () => ({
                success: true,
                data: [{ id: 'a' }],
            })),
        );

        expect(result.current.data).toEqual([{ id: 'a' }]);
        expect(result.current.error).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('clears old data and sets the error when a later load fails', async () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));
        await act(() =>
            result.current.load(async () => ({
                success: true,
                data: [{ id: 'old-period' }],
            })),
        );

        await act(() =>
            result.current.load(async () => ({
                success: false,
                error: 'Gagal memuat rekap bulanan',
            })),
        );

        expect(result.current.data).toEqual([]);
        expect(result.current.error).toBe('Gagal memuat rekap bulanan');
    });

    it('drops the previous period immediately when a new load starts', async () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));
        await act(() =>
            result.current.load(async () => ({
                success: true,
                data: [{ id: 'old-period' }],
            })),
        );
        const pending = deferred<{ success: boolean; data: Row[] }>();

        let loading: Promise<void> = Promise.resolve();
        act(() => {
            loading = result.current.load(() => pending.promise);
        });

        expect(result.current.data).toEqual([]);
        expect(result.current.loading).toBe(true);
        await act(async () => {
            pending.resolve({ success: true, data: [] });
            await loading;
        });
    });

    it('uses the fallback message when a failure has no text, and when the call throws', async () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));

        await act(() =>
            result.current.load(async () => ({ success: false })),
        );
        expect(result.current.error).toBe(FALLBACK);

        await act(() =>
            result.current.load(async () => {
                throw new Error('network');
            }),
        );
        expect(result.current.error).toBe(FALLBACK);
        expect(result.current.loading).toBe(false);
    });

    it('ignores a stale response that arrives after a newer request', async () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));
        const first = deferred<{ success: boolean; data: Row[] }>();
        const second = deferred<{ success: boolean; data: Row[] }>();

        let p1: Promise<void> = Promise.resolve();
        let p2: Promise<void> = Promise.resolve();
        act(() => {
            p1 = result.current.load(() => first.promise);
            p2 = result.current.load(() => second.promise);
        });
        await act(async () => {
            second.resolve({ success: true, data: [{ id: 'new' }] });
            await p2;
            first.resolve({ success: true, data: [{ id: 'stale' }] });
            await p1;
        });

        await waitFor(() =>
            expect(result.current.data).toEqual([{ id: 'new' }]),
        );
        expect(result.current.loading).toBe(false);
    });

    it('can be retried after an error', async () => {
        const { result } = renderHook(() => useSummaryLoader<Row>(FALLBACK));
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce({ success: false, error: 'x' })
            .mockResolvedValueOnce({ success: true, data: [{ id: 'ok' }] });

        await act(() => result.current.load(fetcher));
        await act(() => result.current.load(fetcher));

        expect(result.current.error).toBeNull();
        expect(result.current.data).toEqual([{ id: 'ok' }]);
    });
});
