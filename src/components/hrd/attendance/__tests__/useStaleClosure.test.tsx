// @vitest-environment jsdom

import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as closure from '@/actions/hrd/stale-session-closure';
import { useStaleClosure } from '../useStaleClosure';
import { APPLY_RESULT, PREVIEW } from './closureFixtures';

vi.mock('@/actions/hrd/stale-session-closure', () => ({
    previewStaleSessionClosure: vi.fn(),
    applyStaleSessionClosure: vi.fn(),
}));

const previewOk = (data = PREVIEW) => ({ success: true, data }) as never;
const applyOk = () => ({ success: true, data: APPLY_RESULT }) as never;

function setup() {
    const onApplied = vi.fn();
    const hook = renderHook(() => useStaleClosure(onApplied));
    return { ...hook, onApplied };
}

describe('useStaleClosure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(closure.previewStaleSessionClosure).mockResolvedValue(previewOk());
    });

    it('starts idle without calling the server', () => {
        const { result } = setup();

        expect(result.current.phase.status).toBe('idle');
        expect(closure.previewStaleSessionClosure).not.toHaveBeenCalled();
    });

    it('requests a preview with the chosen ids and policy', async () => {
        const { result } = setup();

        act(() => result.current.open(['r1', 'r2'], 'CLOCK_IN_PLUS_PLANNED'));

        expect(result.current.phase.status).toBe('loading');
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));
        expect(closure.previewStaleSessionClosure).toHaveBeenCalledWith({
            recordIds: ['r1', 'r2'],
            policy: 'CLOCK_IN_PLUS_PLANNED',
        });
    });

    it('shows an error state (not an empty preview) when the preview fails, and retries', async () => {
        vi.mocked(closure.previewStaleSessionClosure)
            .mockResolvedValueOnce({ success: false, error: 'Ditolak server' } as never)
            .mockResolvedValueOnce(previewOk());
        const { result } = setup();

        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('error'));
        expect(result.current.phase).toMatchObject({ message: 'Ditolak server' });

        act(() => result.current.retry());
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));
        expect(closure.previewStaleSessionClosure).toHaveBeenLastCalledWith({
            recordIds: ['r1'],
            policy: 'SHIFT_END',
        });
    });

    it('treats a thrown preview as an error with a generic message', async () => {
        vi.mocked(closure.previewStaleSessionClosure).mockRejectedValue(new Error('net'));
        const { result } = setup();

        act(() => result.current.open(['r1'], 'SHIFT_END'));

        await waitFor(() => expect(result.current.phase.status).toBe('error'));
        expect(result.current.phase).toMatchObject({
            message: 'Gagal membuat pratinjau koreksi',
        });
    });

    it('ignores a stale preview response after a newer request (policy changed)', async () => {
        let resolveFirst: (v: never) => void = () => undefined;
        vi.mocked(closure.previewStaleSessionClosure)
            .mockImplementationOnce(
                () => new Promise((r) => (resolveFirst = r as never)) as never,
            )
            .mockResolvedValueOnce(
                previewOk({ ...PREVIEW, policy: 'CLOCK_IN_PLUS_PLANNED', fingerprint: 'fp-new' }),
            );
        const { result } = setup();

        act(() => result.current.open(['r1'], 'SHIFT_END'));
        act(() => result.current.open(['r1'], 'CLOCK_IN_PLUS_PLANNED'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));
        await act(async () => resolveFirst(previewOk({ ...PREVIEW, fingerprint: 'fp-old' })));

        expect(result.current.phase).toMatchObject({
            status: 'ready',
            preview: { fingerprint: 'fp-new' },
        });
    });

    it('ignores a preview that arrives after the dialog was closed', async () => {
        let resolveFirst: (v: never) => void = () => undefined;
        vi.mocked(closure.previewStaleSessionClosure).mockImplementationOnce(
            () => new Promise((r) => (resolveFirst = r as never)) as never,
        );
        const { result } = setup();

        act(() => result.current.open(['r1'], 'SHIFT_END'));
        act(() => result.current.close());
        await act(async () => resolveFirst(previewOk()));

        expect(result.current.phase.status).toBe('idle');
    });

    it('applies the previewed ids (fingerprint covers all of them) with the preview fingerprint and policy', async () => {
        vi.mocked(closure.applyStaleSessionClosure).mockResolvedValue(applyOk());
        const { result, onApplied } = setup();
        act(() => result.current.open(['r1', 'r2', 'r3'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            await result.current.apply();
        });

        expect(closure.applyStaleSessionClosure).toHaveBeenCalledWith({
            recordIds: ['r1', 'r2', 'r3'],
            policy: 'SHIFT_END',
            fingerprint: 'fp-abc',
        });
        expect(result.current.phase).toMatchObject({
            status: 'done',
            result: APPLY_RESULT,
        });
        expect(onApplied).toHaveBeenCalledTimes(1);
    });

    it('calls the server once when apply is triggered twice synchronously', async () => {
        let resolveApply: (v: never) => void = () => undefined;
        vi.mocked(closure.applyStaleSessionClosure).mockImplementation(
            () => new Promise((r) => (resolveApply = r as never)) as never,
        );
        const { result } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            void result.current.apply();
            void result.current.apply();
        });
        await act(async () => resolveApply(applyOk()));

        expect(closure.applyStaleSessionClosure).toHaveBeenCalledTimes(1);
    });

    it('does nothing when applying outside the ready phase', async () => {
        const { result } = setup();

        await act(async () => {
            await result.current.apply();
        });

        expect(closure.applyStaleSessionClosure).not.toHaveBeenCalled();
    });

    it('does not apply when no row is eligible', async () => {
        vi.mocked(closure.previewStaleSessionClosure).mockResolvedValue(
            previewOk({
                ...PREVIEW,
                rows: PREVIEW.rows.map((r) => ({ ...r, eligible: false })),
                totals: { eligibleCount: 0, ineligibleCount: 3, earnings: 0 },
            }),
        );
        const { result } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            await result.current.apply();
        });

        expect(closure.applyStaleSessionClosure).not.toHaveBeenCalled();
    });

    it('keeps the preview and flags a data-changed error so the preview can be rebuilt', async () => {
        vi.mocked(closure.applyStaleSessionClosure).mockResolvedValue({
            success: false,
            error: 'Data berubah sejak pratinjau, buat pratinjau ulang',
        } as never);
        const { result, onApplied } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            await result.current.apply();
        });

        expect(result.current.phase).toMatchObject({
            status: 'ready',
            applyError: 'Data berubah sejak pratinjau, buat pratinjau ulang',
            isOutdated: true,
        });
        expect(onApplied).not.toHaveBeenCalled();
    });

    it('keeps the preview with a non-outdated error for other server failures', async () => {
        vi.mocked(closure.applyStaleSessionClosure).mockResolvedValue({
            success: false,
            error: 'Tidak berwenang',
        } as never);
        const { result } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            await result.current.apply();
        });

        expect(result.current.phase).toMatchObject({
            status: 'ready',
            applyError: 'Tidak berwenang',
            isOutdated: false,
        });
    });

    it('reports a thrown apply as a generic error and allows another attempt', async () => {
        vi.mocked(closure.applyStaleSessionClosure)
            .mockRejectedValueOnce(new Error('net'))
            .mockResolvedValueOnce(applyOk());
        const { result } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            await result.current.apply();
        });
        expect(result.current.phase).toMatchObject({
            status: 'ready',
            applyError: 'Gagal menerapkan koreksi',
        });

        await act(async () => {
            await result.current.apply();
        });
        expect(result.current.phase.status).toBe('done');
    });

    it('cannot be closed while applying', async () => {
        let resolveApply: (v: never) => void = () => undefined;
        vi.mocked(closure.applyStaleSessionClosure).mockImplementation(
            () => new Promise((r) => (resolveApply = r as never)) as never,
        );
        const { result } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));

        await act(async () => {
            void result.current.apply();
        });
        act(() => result.current.close());

        expect(result.current.phase.status).toBe('applying');
        await act(async () => resolveApply(applyOk()));
        expect(result.current.phase.status).toBe('done');
    });

    it('returns to idle when closed after finishing', async () => {
        vi.mocked(closure.applyStaleSessionClosure).mockResolvedValue(applyOk());
        const { result } = setup();
        act(() => result.current.open(['r1'], 'SHIFT_END'));
        await waitFor(() => expect(result.current.phase.status).toBe('ready'));
        await act(async () => {
            await result.current.apply();
        });

        act(() => result.current.close());

        expect(result.current.phase.status).toBe('idle');
    });
});
