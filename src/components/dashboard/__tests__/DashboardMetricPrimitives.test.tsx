// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
    TargetProgress,
} from '../DashboardMetricPrimitives';

const definition = {
    unit: 'IDR',
    period: 'Bulan berjalan (MTD)',
    description: 'Nilai sintetis untuk regression presentation.',
    source: 'Fixture',
};

describe('dashboard metric primitives', () => {
    it('renders an available metric with visible unit, period, definition, and drill-down', () => {
        render(
            <DashboardHealthCard
                title="Pendapatan"
                value="Rp 1.000"
                definition={definition}
                href="/finance/reports"
                supportingText="Naik dibanding bulan lalu"
            />,
        );
        expect(screen.getByText('AVAILABLE')).toBeTruthy();
        expect(screen.getByText('IDR')).toBeTruthy();
        expect(screen.getByText('Bulan berjalan (MTD)')).toBeTruthy();
        expect(screen.getByLabelText(/Nilai sintetis.*Sumber: Fixture/)).toBeTruthy();
        expect(screen.getByText('Pendapatan').closest('a')?.getAttribute('href')).toBe('/finance/reports');
    });

    it('distinguishes unavailable and not-configured metrics from valid zero', () => {
        const { rerender } = render(
            <DashboardHealthCard title="Kas" value="Rp 0" definition={definition} state="UNAVAILABLE" />,
        );
        expect(screen.getByText('UNAVAILABLE')).toBeTruthy();
        expect(screen.getByText('Data tidak tersedia')).toBeTruthy();
        expect(screen.queryByText('Rp 0')).toBeNull();

        rerender(
            <DashboardHealthCard
                title="Valuasi"
                definition={definition}
                state="NOT_CONFIGURED"
                href="/warehouse/analytics"
            />,
        );
        expect(screen.getByText('NOT_CONFIGURED')).toBeTruthy();
        expect(screen.getByText('Belum dikonfigurasi')).toBeTruthy();
        expect(
            screen
                .getByText('Belum dikonfigurasi')
                .closest('a')
                ?.getAttribute('href'),
        ).toBe('/warehouse/analytics');
    });

    it('formats freshness in WIB and clamps progress visibly', () => {
        render(
            <>
                <DashboardFreshness generatedAt="2026-10-09T08:00:00.000Z" />
                <TargetProgress value={125} label="Pencapaian" />
            </>,
        );
        expect(screen.getByText(/Diperbarui 15.00 WIB/)).toBeTruthy();
        expect(screen.getByText('100%')).toBeTruthy();
        expect(screen.getByLabelText('Pencapaian: 100%')).toBeTruthy();
    });

    it('allows a section-level unavailable message', () => {
        render(
            <DashboardSectionState
                state="UNAVAILABLE"
                title="Sebagian data tidak tersedia"
                description="Produksi tidak ditampilkan."
            />,
        );
        expect(screen.getByRole('status').textContent).toContain(
            'Produksi tidak ditampilkan',
        );
    });
});
