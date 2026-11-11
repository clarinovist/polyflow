// @vitest-environment jsdom
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import * as actions from '@/actions/admin/attendance';
import {
    buildCorrectionPayload,
    buildInitialForm,
    useCorrectAttendance,
} from '../useCorrectAttendance';
import { RECORD } from './fixtures';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/admin/attendance', () => ({ correctAttendance: vi.fn() }));

const EMPTY = { clockInAt: '', clockOutAt: '', notes: '' };

describe('buildInitialForm', () => {
    it('converts clock times to WIB and leaves notes empty', () => {
        expect(
            buildInitialForm({ ...RECORD, clockOutAt: '2026-11-10T08:30:00.000Z' }),
        ).toEqual({
            clockInAt: '2026-11-10T07:00',
            clockOutAt: '2026-11-10T15:30',
            notes: '',
        });
    });

    it('uses empty strings for missing clock times', () => {
        expect(buildInitialForm({ ...RECORD, clockInAt: null })).toEqual(EMPTY);
    });
});

describe('buildCorrectionPayload', () => {
    const initial = { clockInAt: '2026-11-10T07:00', clockOutAt: '', notes: '' };

    it('is empty when nothing changed', () => {
        expect(buildCorrectionPayload(initial, initial)).toEqual({});
    });

    it('includes only changed non-empty times and any notes', () => {
        expect(
            buildCorrectionPayload(
                { clockInAt: '2026-11-10T06:45', clockOutAt: '2026-11-10T16:00', notes: 'Lupa' },
                initial,
            ),
        ).toEqual({
            clockInAt: '2026-11-10T06:45',
            clockOutAt: '2026-11-10T16:00',
            notes: 'Lupa',
        });
    });

    it('never sends a cleared time', () => {
        expect(
            buildCorrectionPayload({ ...initial, clockInAt: '' }, initial),
        ).toEqual({});
    });
});

describe('useCorrectAttendance', () => {
    beforeEach(() => vi.clearAllMocks());

    it('starts closed and opens with the record form', () => {
        const { result } = renderHook(() => useCorrectAttendance(vi.fn()));
        expect(result.current.correcting).toBeNull();
        act(() => result.current.open(RECORD));
        expect(result.current.correcting).toEqual(RECORD);
        expect(result.current.form.clockInAt).toBe('2026-11-10T07:00');
        act(() => result.current.close());
        expect(result.current.correcting).toBeNull();
    });

    it('updates a single field immutably', () => {
        const { result } = renderHook(() => useCorrectAttendance(vi.fn()));
        act(() => result.current.open(RECORD));
        const before = result.current.form;
        act(() => result.current.setField('notes', 'Alasan'));
        expect(result.current.form.notes).toBe('Alasan');
        expect(before.notes).toBe('');
    });

    it('does nothing on submit without a record', async () => {
        const { result } = renderHook(() => useCorrectAttendance(vi.fn()));
        await act(() => result.current.submit());
        expect(actions.correctAttendance).not.toHaveBeenCalled();
    });

    it('saves, toasts and notifies on success', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: true } as never);
        const onSaved = vi.fn();
        const { result } = renderHook(() => useCorrectAttendance(onSaved));
        act(() => result.current.open(RECORD));
        act(() => result.current.setField('notes', 'Koreksi'));
        await act(() => result.current.submit());
        expect(actions.correctAttendance).toHaveBeenCalledWith('r1', { notes: 'Koreksi' });
        expect(toast.success).toHaveBeenCalledWith('Koreksi tersimpan');
        expect(onSaved).toHaveBeenCalledTimes(1);
        expect(result.current.correcting).toBeNull();
        expect(result.current.loading).toBe(false);
    });

    it('toasts the server error and stays open on failure', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: false, error: 'Ditolak' } as never);
        const onSaved = vi.fn();
        const { result } = renderHook(() => useCorrectAttendance(onSaved));
        act(() => result.current.open(RECORD));
        await act(() => result.current.submit());
        expect(toast.error).toHaveBeenCalledWith('Ditolak');
        expect(onSaved).not.toHaveBeenCalled();
        expect(result.current.correcting).toEqual(RECORD);
    });

    it('uses a generic message when the failure has no error text or throws', async () => {
        vi.mocked(actions.correctAttendance)
            .mockResolvedValueOnce({ success: false } as never)
            .mockRejectedValueOnce(new Error('boom'));
        const { result } = renderHook(() => useCorrectAttendance(vi.fn()));
        act(() => result.current.open(RECORD));
        await act(() => result.current.submit());
        await act(() => result.current.submit());
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
        expect(vi.mocked(toast.error).mock.calls.every((c) => c[0] === 'Gagal koreksi')).toBe(true);
    });
});
