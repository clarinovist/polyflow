// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    DashboardFreshness,
    DashboardHealthCard,
    DashboardSectionState,
    TargetProgress,
} from '../DashboardMetricPrimitives';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const definition = {
    unit: 'Rupiah',
    period: 'Bulan berjalan',
    description: 'Nilai sintetis untuk regression presentation.',
    source: 'Fixture',
};

describe('dashboard metric primitives', () => {
    it('renders a value-first metric with disclosure and sibling drill-down interactions', () => {
        render(
            <DashboardHealthCard
                title="Pendapatan"
                value="Rp 1.000"
                definition={definition}
                href="/finance/reports"
                supportingText="Naik dibanding bulan lalu"
            />,
        );

        expect(screen.queryByText('AVAILABLE')).toBeNull();
        expect(screen.getByText('Rp 1.000')).toBeTruthy();
        expect(screen.getByText('Bulan berjalan')).toBeTruthy();
        expect(screen.getByText('Rupiah')).toBeTruthy();
        expect(
            screen.queryByText('Nilai sintetis untuk regression presentation.'),
        ).toBeNull();

        const info = screen.getByRole('button', {
            name: 'Penjelasan Pendapatan',
        });
        fireEvent.click(info, { detail: 1 });
        expect(screen.getByRole('tooltip').textContent).toContain(
            'Nilai sintetis untuk regression presentation.',
        );
        expect(screen.getByRole('tooltip').textContent).toContain(
            'Sumber data: Fixture',
        );

        const link = screen.getByRole('link', { name: 'Buka Pendapatan' });
        expect(link.getAttribute('href')).toBe('/finance/reports');
        expect(link.contains(info)).toBe(false);
    });

    it('distinguishes localized unavailable and not-ready metrics from valid zero', () => {
        const { rerender } = render(
            <DashboardHealthCard
                title="Kas"
                value="Rp 0"
                definition={definition}
                state="UNAVAILABLE"
            />,
        );
        expect(screen.queryByText('UNAVAILABLE')).toBeNull();
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
        expect(screen.queryByText('NOT_CONFIGURED')).toBeNull();
        expect(screen.getByText('Belum disiapkan')).toBeTruthy();
        expect(
            screen
                .getByRole('link', { name: 'Buka Valuasi' })
                .getAttribute('href'),
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
