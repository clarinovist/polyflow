// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KioskHubMenu } from '../KioskHubMenu';

afterEach(cleanup);

const base = {
    operatorName: 'Operator 3',
    machineNames: ['Mesin 2'],
    activeJobs: 0,
    hasProsesKhusus: true,
    onChangeOperator: vi.fn(),
};

describe('KioskHubMenu', () => {
    it('greets the operator and offers the same kind of tile for every menu', () => {
        render(<KioskHubMenu {...base} />);

        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Halo, Operator 3');
        expect(screen.getByText('Mesin 2')).toBeTruthy();
        expect(screen.getByRole('link', { name: /SPK saya/ }).getAttribute('href')).toBe('/kiosk/jobs');
        expect(screen.getByRole('link', { name: /Absensi/ }).getAttribute('href')).toBe('/kiosk/attendance');
        expect(screen.getByRole('link', { name: /Laporan HD/ }).getAttribute('href')).toBe('/kiosk/production/hd');
        expect(screen.queryByText(/Potong/)).toBeNull();
        expect(screen.getByRole('link', { name: /Status saya/ }).getAttribute('href')).toBe('/my');
    });

    it('counts running SPKs on the SPK tile and hides Laporan HD when it is off', () => {
        render(<KioskHubMenu {...base} activeJobs={2} hasProsesKhusus={false} />);

        expect(screen.getByRole('link', { name: /SPK saya.*2 berjalan/ })).toBeTruthy();
        expect(screen.queryByRole('link', { name: /Laporan HD/ })).toBeNull();
    });

    it('asks to change the operator', () => {
        const onChangeOperator = vi.fn();
        render(<KioskHubMenu {...base} onChangeOperator={onChangeOperator} />);

        fireEvent.click(screen.getByRole('button', { name: 'Ganti operator' }));

        expect(onChangeOperator).toHaveBeenCalledTimes(1);
    });
});
