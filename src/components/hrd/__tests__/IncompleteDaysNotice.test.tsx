// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    IncompleteDaysBadge,
    IncompleteDaysEmployeeNotice,
    IncompleteDaysSummaryNotice,
} from '../IncompleteDaysNotice';

describe('IncompleteDaysSummaryNotice', () => {
    it('renders nothing when no employee has incomplete days', () => {
        const { container } = render(
            <IncompleteDaysSummaryNotice employeeCount={0} />,
        );

        expect(container.innerHTML).toBe('');
    });

    it('explains the Rp0 consequence and links to the stale sessions list', () => {
        render(<IncompleteDaysSummaryNotice employeeCount={3} />);

        expect(
            screen.getByText(/3 karyawan harian punya hari tanpa jam pulang/),
        ).toBeTruthy();
        expect(screen.getByText(/upah hari tsb Rp0/)).toBeTruthy();
        const link = screen.getByRole('link', { name: /Sesi belum pulang/ });
        expect(link.getAttribute('href')).toBe('/hrd/attendance?status=stale');
    });
});

describe('IncompleteDaysBadge', () => {
    it('renders nothing for zero or undefined', () => {
        const a = render(<IncompleteDaysBadge days={0} />);
        expect(a.container.innerHTML).toBe('');
        const b = render(<IncompleteDaysBadge days={undefined} />);
        expect(b.container.innerHTML).toBe('');
    });

    it('shows the number of days without clock-out', () => {
        render(<IncompleteDaysBadge days={2} />);

        expect(screen.getByText('2 hari tanpa jam pulang')).toBeTruthy();
    });
});

describe('IncompleteDaysEmployeeNotice', () => {
    it('renders nothing when there are no dates', () => {
        const a = render(<IncompleteDaysEmployeeNotice dates={[]} />);
        expect(a.container.innerHTML).toBe('');
        const b = render(<IncompleteDaysEmployeeNotice dates={undefined} />);
        expect(b.container.innerHTML).toBe('');
    });

    it('lists the dates in Indonesian format and links to the stale list', () => {
        render(
            <IncompleteDaysEmployeeNotice dates={['2026-07-14', '2026-07-16']} />,
        );

        expect(screen.getByText(/2 hari belum ada jam pulang/)).toBeTruthy();
        expect(screen.getByText(/14 Jul 2026, 16 Jul 2026/)).toBeTruthy();
        const link = screen.getByRole('link', { name: /Sesi belum pulang/ });
        expect(link.getAttribute('href')).toBe('/hrd/attendance?status=stale');
    });
});
