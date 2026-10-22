// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Page from '../page';

const { getDailyReport, getMachineRecap } = vi.hoisted(() => ({
    getDailyReport: vi.fn(), getMachineRecap: vi.fn(),
}));
vi.mock('@/lib/core/tenant', () => ({ withTenantPage: (fn: unknown) => fn }));
vi.mock('@/services/production/production-daily-report-service', () => ({
    ProductionDailyReportService: { getDailyReport, getMachineRecap },
}));
vi.mock('@/actions/production/alert-threshold-settings', () => ({
    getProductionAlertThresholdsForPage: vi.fn().mockResolvedValue({ success: false }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T03:00:00Z'));
    getDailyReport.mockReset().mockResolvedValue({
        rows: [],
        periodTotals: Object.fromEntries(['MIXING', 'EXTRUSION', 'PACKING', 'OTHER'].map(key => [key, { produced: 0, scrap: 0, entries: 0 }])),
    });
    getMachineRecap.mockReset().mockResolvedValue({
        machineTotals: { MIXING: [], EXTRUSION: [], PACKING: [], OTHER: [] }, month: '2026-10',
    });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('daily report initial period', () => {
    it('loads this month automatically and renders its active preset below the heading', async () => {
        render(await Page({ searchParams: Promise.resolve({}) }));
        expect(getDailyReport).toHaveBeenCalledExactlyOnceWith({ from: '2026-10-01', to: '2026-10-23' });
        expect(getMachineRecap).toHaveBeenCalledWith({ month: '2026-10' });
        expect(screen.getByText(/Periode 01 Oct 2026 – 23 Oct 2026/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Bulan ini' }).getAttribute('aria-pressed')).toBe('true');
        const heading = screen.getByRole('heading', { name: 'Produksi Harian' });
        const form = screen.getByRole('form', { name: 'Periode produksi' });
        expect(heading.parentElement?.parentElement?.classList.contains('space-y-4')).toBe(true);
        expect(heading.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it.each([
        ['2026-10-31T16:59:59Z', '2026-10-01', '2026-10-31'],
        ['2026-10-31T17:00:00Z', '2026-11-01', '2026-11-01'],
        ['2026-12-31T17:00:00Z', '2027-01-01', '2027-01-01'],
    ])('uses WIB at boundary %s', async (now, from, to) => {
        vi.setSystemTime(new Date(now));
        render(await Page({ searchParams: Promise.resolve({}) }));
        expect(getDailyReport).toHaveBeenCalledWith({ from, to });
        expect((screen.getByLabelText('Dari') as HTMLInputElement).value).toBe(from);
        expect((screen.getByLabelText('Sampai') as HTMLInputElement).value).toBe(to);
        expect(screen.getByRole('button', { name: 'Bulan ini' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('preserves explicit ranges and the separate machine recap filter', async () => {
        render(await Page({ searchParams: Promise.resolve({ from: '2026-08-03', to: '2026-08-18', mesin: 'all' }) }));
        expect(getDailyReport).toHaveBeenCalledWith({ from: '2026-08-03', to: '2026-08-18' });
        expect(getMachineRecap).toHaveBeenCalledWith({ month: null });
        expect(screen.getByRole('button', { name: 'Bulan ini' }).getAttribute('aria-pressed')).toBe('false');
    });

    it('falls back to this month for invalid dates', async () => {
        render(await Page({ searchParams: Promise.resolve({ from: 'invalid', to: '2026-02-30' }) }));
        expect(getDailyReport).toHaveBeenCalledWith({ from: '2026-10-01', to: '2026-10-23' });
    });
});
