// @vitest-environment jsdom
import {
    render,
    screen,
    fireEvent,
    waitFor,
    within,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import React from 'react';
import { toast } from 'sonner';
import { AttendanceRecap } from '../AttendanceRecap';
import * as actions from '@/actions/admin/attendance';
import {
    base,
    installRadixPolyfills,
    props,
} from './attendanceRecapTestKit';

const push = vi.fn();
const refresh = vi.fn();
let params = new URLSearchParams();
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push, refresh }),
    useSearchParams: () => params,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/actions/hrd/stale-session-closure', () => ({
    previewStaleSessionClosure: vi.fn(),
    applyStaleSessionClosure: vi.fn(),
}));
vi.mock('@/actions/admin/attendance', () => ({
    correctAttendance: vi.fn(),
    getAttendanceMonthlySummary: vi.fn(),
    getAttendanceWeeklySummary: vi.fn(),
    listNoRecordAttendance: vi.fn(),
    setAbsent: vi.fn(),
}));

beforeAll(installRadixPolyfills);

function renderDaily(overrides: Partial<React.ComponentProps<typeof AttendanceRecap>> = {}) {
    return render(<AttendanceRecap {...props} {...overrides} />);
}

function openRowMenu(rowName: string) {
    const row = screen.getByText(rowName).closest('tr') as HTMLElement;
    const trigger = within(row).getByRole('button', { name: '' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
}

async function openCorrectDialog(rowName: string) {
    openRowMenu(rowName);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Koreksi Jam' }));
    return screen.findByRole('dialog');
}

beforeEach(() => {
    vi.clearAllMocks();
    params = new URLSearchParams();
    vi.mocked(actions.listNoRecordAttendance).mockResolvedValue({
        success: true,
        data: {
            isNonWorkingDay: false,
            employees: [
                {
                    employeeId: 'e9',
                    name: 'Zed Contoh',
                    code: 'E009',
                    assignedShift: { id: 's1', name: 'Pagi' },
                },
            ],
        },
    } as never);
});

describe('AttendanceRecap selfie lightbox', () => {
    it('opens a lightbox for the clock-in selfie and closes it', async () => {
        renderDaily();
        fireEvent.click(screen.getByLabelText('Lihat selfie masuk Budi Contoh'));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Budi Contoh — Masuk')).toBeTruthy();
        const img = within(dialog).getByRole('img') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('/api/images/acme/attendance/e1/a.jpg');
        fireEvent.keyDown(dialog, { key: 'Escape' });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('opens a lightbox for the clock-out selfie', async () => {
        renderDaily({
            records: [{ ...base, id: 'r1', clockOutPhotoUrl: '/api/images/acme/attendance/e1/b.jpg' }],
        });
        fireEvent.click(screen.getByLabelText('Lihat selfie pulang Budi Contoh'));
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByText('Budi Contoh — Pulang')).toBeTruthy();
    });

    it('shows a dash instead of a thumbnail without a valid selfie', () => {
        renderDaily({
            records: [{ ...base, id: 'r1', hasValidSelfie: false }],
        });
        expect(screen.queryByLabelText('Lihat selfie masuk Budi Contoh')).toBeNull();
        expect(screen.queryAllByAltText('Selfie masuk Budi Contoh').length).toBe(0);
    });
});

describe('AttendanceRecap correction dialog', () => {
    it('opens prefilled with WIB times and the employee name', async () => {
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        expect(within(dialog).getByText('Koreksi Absensi — Budi Contoh')).toBeTruthy();
        expect((within(dialog).getByLabelText('Jam Masuk') as HTMLInputElement).value).toBe('2026-11-10T07:00');
        expect((within(dialog).getByLabelText('Jam Pulang') as HTMLInputElement).value).toBe('');
        expect((within(dialog).getByLabelText('Catatan') as HTMLTextAreaElement).value).toBe('');
    });

    it('sends only changed fields plus notes on success and refreshes', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: true } as never);
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.change(within(dialog).getByLabelText('Jam Pulang'), { target: { value: '2026-11-10T16:00' } });
        fireEvent.change(within(dialog).getByLabelText('Catatan'), { target: { value: 'Lupa absen pulang' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() =>
            expect(actions.correctAttendance).toHaveBeenCalledWith('r1', {
                clockOutAt: '2026-11-10T16:00',
                notes: 'Lupa absen pulang',
            }),
        );
        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Koreksi tersimpan'));
        expect(refresh).toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('sends clock-in when changed and an empty payload when nothing changed', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: true } as never);
        renderDaily();
        let dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() => expect(actions.correctAttendance).toHaveBeenCalledWith('r1', {}));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.change(within(dialog).getByLabelText('Jam Masuk'), { target: { value: '2026-11-10T06:45' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() =>
            expect(actions.correctAttendance).toHaveBeenLastCalledWith('r1', {
                clockInAt: '2026-11-10T06:45',
            }),
        );
    });

    it('does not send a cleared time field', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: true } as never);
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.change(within(dialog).getByLabelText('Jam Masuk'), { target: { value: '' } });
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() => expect(actions.correctAttendance).toHaveBeenCalledWith('r1', {}));
    });

    it('shows the server error and keeps the dialog open', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: false, error: 'Jam pulang sebelum masuk' } as never);
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Jam pulang sebelum masuk'));
        expect(refresh).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeTruthy();
    });

    it('falls back to a generic error when the server gives no message', async () => {
        vi.mocked(actions.correctAttendance).mockResolvedValue({ success: false } as never);
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Gagal koreksi'));
    });

    it('shows a generic error when the action throws', async () => {
        vi.mocked(actions.correctAttendance).mockRejectedValue(new Error('boom'));
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Gagal koreksi'));
        await waitFor(() =>
            expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Simpan Koreksi' })).toBeTruthy(),
        );
    });

    it('disables saving while the request is in flight', async () => {
        let resolve: (v: unknown) => void = () => undefined;
        vi.mocked(actions.correctAttendance).mockReturnValue(
            new Promise((r) => {
                resolve = r;
            }) as never,
        );
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Simpan Koreksi' }));
        const saving = await within(screen.getByRole('dialog')).findByRole('button', { name: 'Menyimpan...' });
        expect((saving as HTMLButtonElement).disabled).toBe(true);
        resolve({ success: true });
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('closes without saving on Batal', async () => {
        renderDaily();
        const dialog = await openCorrectDialog('Budi Contoh');
        fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(actions.correctAttendance).not.toHaveBeenCalled();
    });
});
