// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOpnameAutosave } from '../useOpnameAutosave';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useOpnameAutosave', () => {
    it('calls saveFn after debounce delay', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);
        const payload = { count: '10' };

        const { result } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 500 }),
            { initialProps: { p: payload } },
        );

        expect(saveFn).not.toHaveBeenCalled();
        expect(result.current.status).toBe('idle');

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(saveFn).toHaveBeenCalledWith(payload);
        expect(result.current.status).toBe('saved');
    });

    it('flush() triggers save immediately', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);
        const payload = { count: '20' };

        const { result } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 5000 }),
            { initialProps: { p: payload } },
        );

        expect(saveFn).not.toHaveBeenCalled();

        act(() => {
            result.current.flush();
        });

        await act(async () => {
            vi.advanceTimersByTime(0);
        });

        expect(saveFn).toHaveBeenCalledWith(payload);
        expect(result.current.status).toBe('saved');
    });

    it('flush() cancels pending timer', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);
        const payload1 = { count: '10' };
        const payload2 = { count: '20' };

        const { result, rerender } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 1000 }),
            { initialProps: { p: payload1 } },
        );

        rerender({ p: payload2 });

        act(() => {
            result.current.flush();
        });

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });

        expect(saveFn).toHaveBeenCalledTimes(1);
        expect(saveFn).toHaveBeenCalledWith(payload2);
    });

    it('guards concurrent save with trailing re-run', async () => {
        let resolveFirst: () => void;
        const firstCall = new Promise<void>((r) => {
            resolveFirst = r;
        });
        const saveFn = vi
            .fn()
            .mockImplementationOnce(() => firstCall)
            .mockResolvedValue(undefined);
        const payload = { count: '10' };

        const { result } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 500 }),
            { initialProps: { p: payload } },
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.status).toBe('saving');
        expect(saveFn).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveFirst!();
        });

        expect(result.current.status).toBe('saved');
    });

    it('sets error status on save failure', async () => {
        const saveFn = vi.fn().mockRejectedValue(new Error('fail'));
        const payload = { count: '10' };

        const { result } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 500 }),
            { initialProps: { p: payload } },
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.status).toBe('error');
    });

    it('does not save when enabled is false', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);
        const payload = { count: '10' };

        renderHook(
            ({ p }) =>
                useOpnameAutosave(p, saveFn, {
                    enabled: false,
                    delayMs: 500,
                }),
            { initialProps: { p: payload } },
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(saveFn).not.toHaveBeenCalled();
    });

    it('does not save when payload is null or undefined', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);

        renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 500 }),
            { initialProps: { p: null as unknown as Record<string, string> } },
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(saveFn).not.toHaveBeenCalled();
    });

    it('records lastSavedAt after successful save', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);
        const payload = { count: '10' };

        const { result } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 500 }),
            { initialProps: { p: payload } },
        );

        expect(result.current.lastSavedAt).toBeNull();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.lastSavedAt).toBeInstanceOf(Date);
    });

    it('resets timer on payload change (debounce restart)', async () => {
        const saveFn = vi.fn().mockResolvedValue(undefined);

        const { rerender } = renderHook(
            ({ p }) => useOpnameAutosave(p, saveFn, { delayMs: 1000 }),
            { initialProps: { p: { count: '1' } } },
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        rerender({ p: { count: '2' } });

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(saveFn).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(saveFn).toHaveBeenCalledTimes(1);
        expect(saveFn).toHaveBeenCalledWith({ count: '2' });
    });
});
