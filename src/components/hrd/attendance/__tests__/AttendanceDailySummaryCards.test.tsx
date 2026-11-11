// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import React from 'react';
import { AttendanceDailySummaryCards } from '../AttendanceDailySummaryCards';

const summary = {
    totalEmployees: 3,
    totalRecords: 4,
    multiShiftCount: 1,
    totalActualHours: 24.25,
    totalOvertimeHours: 2,
};

describe('AttendanceDailySummaryCards', () => {
    it('renders the five daily totals', () => {
        render(<AttendanceDailySummaryCards summary={summary} />);
        expect(screen.getByText('3 orang')).toBeTruthy();
        expect(screen.getByText('4 shift')).toBeTruthy();
        expect(screen.getByText('Shift Ganda')).toBeTruthy();
        expect(screen.getByText('1 orang').className).toContain('text-primary');
        expect(screen.getByText('24.3j')).toBeTruthy();
        expect(screen.getByText('2.0j').className).toContain('text-primary');
    });

    it('does not accent multi-shift and overtime when they are zero', () => {
        render(
            <AttendanceDailySummaryCards
                summary={{ ...summary, multiShiftCount: 0, totalOvertimeHours: 0 }}
            />,
        );
        expect(screen.getByText('0 orang').className).toContain('text-foreground');
        expect(screen.getByText('0.0j').className).toContain('text-foreground');
    });
});
