// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHrdMobileTeamAttendance } from '@/actions/hrd/mobile-dashboard';
import HrdAttendancePage from '../page';

vi.mock('@/actions/hrd/mobile-dashboard', () => ({
    getHrdMobileTeamAttendance: vi.fn(),
}));
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => vi.resetAllMocks());

describe('HrdAttendancePage', () => {
    it('validates status and passes page from the URL', async () => {
        vi.mocked(getHrdMobileTeamAttendance).mockResolvedValue({
            success: false,
            error: 'x',
            code: 'E',
        });
        await HrdAttendancePage({
            searchParams: Promise.resolve({ status: 'BOGUS', page: '2' }),
        });
        expect(getHrdMobileTeamAttendance).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'ALL', page: '2' }),
        );
    });

    it('forwards the specific error message to the UI', async () => {
        vi.mocked(getHrdMobileTeamAttendance).mockResolvedValue({
            success: false,
            error: 'Tanggal absensi tidak valid.',
            code: 'BUSINESS_RULE',
        });
        const ui = await HrdAttendancePage({
            searchParams: Promise.resolve({}),
        });
        render(ui);
        expect(screen.getByText('Tanggal absensi tidak valid.')).toBeTruthy();
        expect(screen.queryByText(/belum tersedia$/i)).not.toBeNull();
    });
});
