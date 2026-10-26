// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockStartSession } = vi.hoisted(() => ({ mockStartSession: vi.fn() }));
vi.mock('@/actions/production/kiosk-operator-session', () => ({
    startKioskOperatorSession: (...args: unknown[]) => mockStartSession(...args),
}));

import { KioskOperatorGate } from '../KioskOperatorGate';

const employees = [
    { id: 'emp-1', name: 'Operator 1', machineIds: ['m-1'] },
    { id: 'emp-2', name: 'Operator 2', machineIds: ['m-1', 'm-2'] },
];
const machines = [{ id: 'm-1', name: 'Mesin 1' }, { id: 'm-2', name: 'Mesin 2' }];

afterEach(cleanup);
beforeEach(() => mockStartSession.mockReset());

function enterPin(digits: string) {
    for (const digit of digits) {
        fireEvent.click(screen.getByRole('button', { name: digit }));
    }
}

describe('KioskOperatorGate', () => {
    it('asks for the attendance PIN before selecting the operator', async () => {
        mockStartSession.mockResolvedValue({ success: true, data: { id: 'emp-1', name: 'Operator 1', code: 'OP-01' } });
        const onSelect = vi.fn();
        render(<KioskOperatorGate employees={employees} machines={machines} onSelect={onSelect} />);

        fireEvent.click(screen.getByRole('button', { name: /Operator 1/ }));
        expect(screen.getByText('Masukkan PIN absensi')).toBeTruthy();
        enterPin('1234');
        fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

        await waitFor(() => expect(onSelect).toHaveBeenCalledWith('emp-1', 'Operator 1'));
        expect(mockStartSession).toHaveBeenCalledWith('emp-1', '1234');
    });

    it('shows the server message and clears the PIN when it is wrong', async () => {
        mockStartSession.mockResolvedValue({ success: false, error: 'PIN salah.', code: 'BUSINESS_RULE_VIOLATION' });
        const onSelect = vi.fn();
        render(<KioskOperatorGate employees={employees} machines={machines} onSelect={onSelect} />);

        fireEvent.click(screen.getByRole('button', { name: /Operator 2/ }));
        fireEvent.change(screen.getByLabelText('PIN'), { target: { value: '9999' } });
        fireEvent.click(screen.getByRole('button', { name: 'Masuk' }));

        expect((await screen.findByRole('alert')).textContent).toContain('PIN salah.');
        expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('');
        expect(onSelect).not.toHaveBeenCalled();
    });

    it('keeps the Masuk button locked until the PIN has four digits and lets the operator go back', () => {
        render(<KioskOperatorGate employees={employees} machines={machines} onSelect={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: /Operator 1/ }));
        enterPin('12');
        expect((screen.getByRole('button', { name: 'Masuk' }) as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: 'Hapus satu angka' }));
        expect((screen.getByLabelText('PIN') as HTMLInputElement).value).toBe('1');

        fireEvent.click(screen.getByRole('button', { name: 'Bukan saya' }));
        expect(screen.getByRole('button', { name: /Operator 2/ })).toBeTruthy();
    });

    it('explains what to do when no operator is registered', () => {
        render(<KioskOperatorGate employees={[]} machines={machines} onSelect={vi.fn()} />);

        expect(screen.getByText(/Belum ada operator terdaftar/)).toBeTruthy();
    });

    it('filters operators by name and by who is running an SPK', () => {
        render(<KioskOperatorGate employees={employees} machines={machines} runningOperatorIds={['emp-2']} onSelect={vi.fn()} />);

        const search = screen.getByRole('searchbox', { name: 'Cari nama operator' });
        fireEvent.change(search, { target: { value: 'or 2' } });
        expect(screen.queryByRole('button', { name: /Operator 1/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Operator 2/ })).toBeTruthy();

        fireEvent.change(search, { target: { value: '' } });
        fireEvent.click(screen.getByRole('button', { name: /Sedang jalan/ }));
        expect(screen.queryByRole('button', { name: /Operator 1/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Operator 2.*Jalan SPK/ })).toBeTruthy();
    });

    it('opens attendance without choosing an operator', () => {
        render(<KioskOperatorGate employees={employees} machines={machines} onSelect={vi.fn()} />);

        expect(screen.getByRole('link', { name: /Absensi masuk \/ pulang/ }).getAttribute('href')).toBe('/kiosk/attendance');
    });
});
