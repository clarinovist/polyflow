// @vitest-environment jsdom

import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { toast } from 'sonner';
import * as actions from '@/actions/admin/attendance';
import {
    AttendanceStaleSessions,
    toCorrectableRecord,
} from '../AttendanceStaleSessions';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/admin/attendance', () => ({
    listStaleOpenSessions: vi.fn(),
    correctAttendance: vi.fn(),
}));

const SESSION = {
    id: 'r1',
    employeeId: 'e1',
    employeeName: 'Budi Contoh',
    employeeCode: 'E001',
    workDate: '2026-11-09',
    clockInAt: '2026-11-09T00:05:00.000Z',
    shift: { id: 's1', name: 'Pagi', startTime: '07:00', endTime: '15:00' },
    openHours: 30.5,
};
const OTHER = {
    ...SESSION,
    id: 'r2',
    employeeId: 'e2',
    employeeName: 'Siti Contoh',
    employeeCode: 'E002',
};

const listOf = (sessions: unknown[]) =>
    ({ success: true, data: { sessions, truncated: false } }) as never;

function setup(query = '') {
    const onCorrected = vi.fn();
    render(<AttendanceStaleSessions query={query} onCorrected={onCorrected} />);
    return { onCorrected };
}

async function openDialogFor(name: string) {
    const row = (await screen.findByText(name)).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /Koreksi jam/ }));
    return screen.findByRole('dialog');
}

describe('toCorrectableRecord', () => {
    it('keeps the identity and clock times the correction dialog needs', () => {
        expect(toCorrectableRecord(SESSION)).toMatchObject({
            id: 'r1',
            employeeId: 'e1',
            employeeName: 'Budi Contoh',
            employeeCode: 'E001',
            workShiftId: 's1',
            shiftName: 'Pagi',
            clockInAt: '2026-11-09T00:05:00.000Z',
            clockOutAt: null,
            status: 'PRESENT',
        });
    });
});

describe('AttendanceStaleSessions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(actions.listStaleOpenSessions).mockResolvedValue(
            listOf([SESSION, OTHER]),
        );
    });

    it('loads and lists the stale sessions', async () => {
        setup();

        expect(await screen.findByText('Budi Contoh')).toBeTruthy();
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(actions.listStaleOpenSessions).toHaveBeenCalledTimes(1);
    });

    it('shows an error and retries the load', async () => {
        vi.mocked(actions.listStaleOpenSessions)
            .mockResolvedValueOnce({ success: false, error: 'Gagal memuat' } as never)
            .mockResolvedValueOnce(listOf([SESSION]));
        setup();

        expect((await screen.findByRole('alert')).textContent).toContain('Gagal memuat');
        fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));

        expect(await screen.findByText('Budi Contoh')).toBeTruthy();
    });

    it('filters the list by the recap search query', async () => {
        setup('siti');

        expect(await screen.findByText('Siti Contoh')).toBeTruthy();
        expect(screen.queryByText('Budi Contoh')).toBeNull();
    });

    it('opens the existing correction dialog for the chosen record', async () => {
        setup();

        const dialog = await openDialogFor('Siti Contoh');

        expect(within(dialog).getByText(/Koreksi Absensi — Siti Contoh/)).toBeTruthy();
        expect(
            (within(dialog).getByLabelText('Jam Masuk') as HTMLInputElement).value,
        ).toBe('2026-11-09T07:05');
        expect(
            (within(dialog).getByLabelText('Jam Pulang') as HTMLInputElement).value,
        ).toBe('');
    });

    it('saves via correctAttendance, reloads the list and notifies the parent', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({
            success: true,
        } as never);
        vi.mocked(actions.listStaleOpenSessions)
            .mockResolvedValueOnce(listOf([SESSION, OTHER]))
            .mockResolvedValueOnce(listOf([OTHER]));
        const { onCorrected } = setup();

        const dialog = await openDialogFor('Budi Contoh');
        fireEvent.change(within(dialog).getByLabelText('Jam Pulang'), {
            target: { value: '2026-11-09T15:00' },
        });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));

        await waitFor(() =>
            expect(actions.correctAttendance).toHaveBeenCalledWith('r1', {
                clockOutAt: '2026-11-09T15:00',
            }),
        );
        await waitFor(() =>
            expect(actions.listStaleOpenSessions).toHaveBeenCalledTimes(2),
        );
        await waitFor(() => expect(screen.queryByText('Budi Contoh')).toBeNull());
        expect(screen.getByText('Siti Contoh')).toBeTruthy();
        expect(onCorrected).toHaveBeenCalledTimes(1);
    });

    it('does not reload the list when the correction fails', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({
            success: false,
            error: 'Ditolak',
        } as never);
        const { onCorrected } = setup();

        const dialog = await openDialogFor('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Ditolak'));
        expect(actions.listStaleOpenSessions).toHaveBeenCalledTimes(1);
        expect(onCorrected).not.toHaveBeenCalled();
    });

    it('works without a parent callback', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({
            success: true,
        } as never);
        render(<AttendanceStaleSessions query="" />);

        const dialog = await openDialogFor('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));

        await waitFor(() =>
            expect(actions.listStaleOpenSessions).toHaveBeenCalledTimes(2),
        );
    });
});
