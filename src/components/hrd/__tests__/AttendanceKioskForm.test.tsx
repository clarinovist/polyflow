// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const {
    mockKioskClockIn,
    mockKioskClockOut,
    mockUploadSelfieWithRetry,
    mockSampleBestPosition,
} = vi.hoisted(() => ({
    mockKioskClockIn: vi.fn(),
    mockKioskClockOut: vi.fn(),
    mockUploadSelfieWithRetry: vi.fn(),
    mockSampleBestPosition: vi.fn(),
}));

vi.mock('@/actions/admin/attendance', () => ({
    kioskClockIn: (...args: unknown[]) => mockKioskClockIn(...args),
    kioskClockOut: (...args: unknown[]) => mockKioskClockOut(...args),
}));

vi.mock('../attendance-selfie-upload', () => ({
    uploadSelfieWithRetry: (...args: unknown[]) =>
        mockUploadSelfieWithRetry(...args),
}));

vi.mock('@/lib/utils/geolocation-sampler', () => ({
    sampleBestPosition: (...args: unknown[]) => mockSampleBestPosition(...args),
    DEFAULT_TARGET_ACCURACY_METERS: 30,
    DEFAULT_SAMPLE_TIMEOUT_MS: 8000,
}));

vi.mock('../EmployeeNameSearch', () => ({
    EmployeeNameSearch: ({ employees, onSelect }: any) => (
        <button
            data-testid="pick-employee"
            onClick={() => onSelect(employees[0])}
        >
            Pilih Karyawan
        </button>
    ),
}));

vi.mock('../LiveSelfieCapture', () => ({
    LiveSelfieCapture: ({ onCapture }: any) => (
        <button
            data-testid="capture-selfie"
            onClick={() =>
                onCapture(new File(['x'], 'selfie.jpg', { type: 'image/jpeg' }))
            }
        >
            Ambil Selfie
        </button>
    ),
}));

import { AttendanceKioskForm } from '../AttendanceKioskForm';

const EMPLOYEES = [{ id: 'emp-1', name: 'Budi', code: 'EMP-001' }];

async function fillForm() {
    fireEvent.click(screen.getByTestId('pick-employee'));
    fireEvent.change(screen.getByPlaceholderText('••••'), {
        target: { value: '1234' },
    });
    fireEvent.click(screen.getByTestId('capture-selfie'));
    await waitFor(() =>
        expect(
            screen
                .getByRole('button', { name: /MASUK/i })
                .hasAttribute('disabled'),
        ).toBe(false),
    );
}

describe('AttendanceKioskForm', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSampleBestPosition.mockResolvedValue({
            sample: { latitude: -6.1, longitude: 106.1, accuracy: 12 },
        });
        mockUploadSelfieWithRetry.mockResolvedValue({ url: '/selfie.jpg' });
        mockKioskClockIn.mockResolvedValue({
            success: true,
            data: {
                employeeName: 'Budi',
                employeeCode: 'EMP-001',
                shiftName: 'Shift 1',
                isOvertimeShift: false,
            },
        });
    });

    it('sends workShiftId as undefined so the server resolves the shift', async () => {
        render(
            <AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" />,
        );
        await fillForm();

        fireEvent.click(screen.getByRole('button', { name: /MASUK/i }));

        await waitFor(() => expect(mockKioskClockIn).toHaveBeenCalled());
        const args = mockKioskClockIn.mock.calls[0];
        expect(args[0]).toBe('EMP-001');
        expect(args[1]).toBe('1234');
        // Third argument is workShiftId. The kiosk must never guess it.
        expect(args[2]).toBeUndefined();
    });

    it('renders no shift selector at all', async () => {
        render(
            <AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" />,
        );
        expect(document.querySelector('select')).toBeNull();
        expect(screen.queryByText(/shift/i)).toBeNull();
    });

    it('shows the shift name returned by the server, not a client guess', async () => {
        render(
            <AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" />,
        );
        await fillForm();
        fireEvent.click(screen.getByRole('button', { name: /MASUK/i }));

        await waitFor(() =>
            expect(screen.getAllByText(/Shift 1/).length).toBeGreaterThan(0),
        );
    });

    it('surfaces server error and does not clear the form silently', async () => {
        mockKioskClockIn.mockResolvedValue({
            success: false,
            error: 'PIN yang Anda masukkan salah',
        });
        render(
            <AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" />,
        );
        await fillForm();
        fireEvent.click(screen.getByRole('button', { name: /MASUK/i }));

        await waitFor(() =>
            expect(
                screen.getByText('PIN yang Anda masukkan salah'),
            ).toBeTruthy(),
        );
    });

    describe('Tahap 2 kiosk layout', () => {
        it('says why Masuk and Pulang are still locked', async () => {
            render(<AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" />);
            expect(screen.getByText('Pilih nama, lalu isi PIN.')).toBeTruthy();

            fireEvent.click(screen.getByTestId('pick-employee'));
            fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } });

            expect(await screen.findByText('Ambil selfie dulu untuk Masuk. Pulang bisa tanpa selfie.')).toBeTruthy();
        });

        it('shows a load error instead of an empty employee search', () => {
            render(<AttendanceKioskForm employees={[]} employeesError="Daftar karyawan gagal dimuat." geofenceMode="off" />);

            expect(screen.getByRole('alert').textContent).toContain('Daftar karyawan gagal dimuat.');
        });

        it('lets the success message go by itself and keeps a named history', async () => {
            render(<AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" successDismissMs={50} />);
            await fillForm();
            fireEvent.click(screen.getByRole('button', { name: /MASUK/i }));

            const message = await screen.findByRole('status');
            expect(message.textContent).toContain('Budi');
            const history = screen.getByRole('region', { name: 'Tadi di tablet ini' });
            expect(within(history).getByText('Budi')).toBeTruthy();
            expect(within(history).queryByText('EMP-001')).toBeNull();

            await waitFor(() => expect(screen.queryByRole('status')).toBeNull(), { timeout: 3000 });
        });

        it('writes the clock-out hours in plain words', async () => {
            mockKioskClockOut.mockResolvedValue({
                success: true,
                data: { employeeName: 'Budi', employeeCode: 'EMP-001', shiftName: 'Shift 1', actualHours: 8.1, overtimeHours: 1 },
            });
            render(<AttendanceKioskForm employees={EMPLOYEES} geofenceMode="off" />);
            fireEvent.click(screen.getByTestId('pick-employee'));
            fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } });
            fireEvent.click(await screen.findByRole('button', { name: /PULANG/i }));

            expect((await screen.findByRole('status')).textContent).toContain('Budi pulang · kerja 8,1 jam · lembur 1 jam');
        });
    });
});
