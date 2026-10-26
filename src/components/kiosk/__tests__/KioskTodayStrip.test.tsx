// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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

describe('KioskTodayStrip', () => {
    it('separates the good-output quantity from its label', () => {
        render(<KioskTodayStrip operatorName="Operator 1" summary={summary} />);

        expect(screen.getByText('84 BAL bagus')).toBeTruthy();
        expect(screen.getByText('1 aktif')).toBeTruthy();
    });

    it('shows the loading and empty states', () => {
        const { rerender } = render(
            <KioskTodayStrip operatorName="Operator 1" summary={null} isLoading />,
        );
        expect(screen.getByText('Memuat ringkasan shift...')).toBeTruthy();

        rerender(<KioskTodayStrip operatorName="Operator 1" summary={null} />);
        expect(screen.getByText('Belum ada output hari ini')).toBeTruthy();
    });

    it('flags scrap entries whose unit is not verified', () => {
        render(
            <KioskTodayStrip
                operatorName="Operator 1"
                summary={{ ...summary, scrapKg: 0, scrapUnverifiedEntries: 2 }}
            />,
        );

        expect(
            screen.getByText(/2 entri scrap belum terverifikasi satuannya/),
        ).toBeTruthy();
    });
});
