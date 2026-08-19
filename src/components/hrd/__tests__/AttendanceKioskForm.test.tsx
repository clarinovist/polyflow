// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
});
