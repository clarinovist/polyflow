// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReportsPage from '../page';

describe('finance reports catalog', () => {
    it('keeps report destinations as single named links, without nested buttons', () => {
        render(<ReportsPage />);
        const reports = screen.getAllByRole('link', { name: /^Lihat Laporan:/ });
        expect(reports).toHaveLength(9);
        expect(reports.map((link) => link.getAttribute('href'))).toEqual([
            '/finance/reports/balance-sheet', '/finance/reports/income-statement',
            '/finance/reports/trial-balance', '/finance/reports/general-ledger',
            '/finance/reports/cash-flow', '/finance/reports/hpp',
            '/finance/reports/tax', '/finance/reports/maklon', '/finance/budgeting/variance',
        ]);
        for (const link of reports) {
            expect(link.querySelector('button')).toBeNull();
            expect(link.getAttribute('data-variant')).toBe('outline');
        }
        expect(screen.queryByText(/target IA/)).toBeNull();
        expect(screen.getByText(/GL POSTED filter periode/)).toBeTruthy();
    });
});
