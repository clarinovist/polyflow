// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KioskTodayStrip } from '../KioskTodayStrip';

afterEach(cleanup);

const summary = {
    jobCount: 2,
    goodByUnit: [{ unit: 'BAL', quantity: 84 }],
    scrapKg: 1.5,
    scrapUnverifiedEntries: 0,
    activeJobsCount: 1,
};

const stat = (label: string) =>
    within(screen.getByText(label).closest('div')!).getByRole('definition')
        .textContent;

describe('KioskTodayStrip', () => {
    it('shows each figure with its own unit under its own label', () => {
        render(<KioskTodayStrip operatorName="Operator 1" summary={summary} />);

        expect(screen.getByText('Hari ini, Operator 1')).toBeTruthy();
        expect(stat('Hasil bagus')).toBe('84 BAL');
        expect(stat('Affal')).toBe('1,5 KG');
        expect(stat('SPK dikerjakan')).toBe('2');
        expect(stat('SPK berjalan')).toBe('1');
    });

    it('shows the loading and empty states', () => {
        const { rerender } = render(
            <KioskTodayStrip operatorName="Operator 1" summary={null} isLoading />,
        );
        expect(screen.getByText('Memuat ringkasan hari ini…')).toBeTruthy();

        rerender(<KioskTodayStrip operatorName="Operator 1" summary={null} />);
        expect(screen.getByText('Belum ada hasil hari ini.')).toBeTruthy();
    });

    it('flags affal entries whose unit is not verified', () => {
        render(
            <KioskTodayStrip
                operatorName="Operator 1"
                summary={{ ...summary, scrapKg: 0, scrapUnverifiedEntries: 2 }}
            />,
        );

        expect(
            screen.getByText(/2 entri affal belum terverifikasi satuannya/),
        ).toBeTruthy();
    });
});
