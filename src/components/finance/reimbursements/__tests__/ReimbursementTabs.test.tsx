// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ReimbursementTabs } from '../ReimbursementTabs';

afterEach(cleanup);

describe('ReimbursementTabs', () => {
    it('renders one link per tab with a ?tab= query', () => {
        render(<ReimbursementTabs active="queue" />);

        const queue = screen.getByRole('link', { name: 'Menunggu pencairan' });
        const paid = screen.getByRole('link', { name: 'Sudah dibayar' });
        expect(queue.getAttribute('href')).toBe('/finance/reimbursements?tab=queue');
        expect(paid.getAttribute('href')).toBe('/finance/reimbursements?tab=paid');
    });

    it('marks only the active tab as the current page', () => {
        render(<ReimbursementTabs active="paid" />);

        expect(
            screen.getByRole('link', { name: 'Sudah dibayar' }).getAttribute('aria-current'),
        ).toBe('page');
        expect(
            screen.getByRole('link', { name: 'Menunggu pencairan' }).getAttribute('aria-current'),
        ).toBeNull();
    });

    it('is a labelled navigation landmark', () => {
        render(<ReimbursementTabs active="queue" />);

        expect(screen.getByRole('navigation', { name: 'Tab reimburse' })).toBeTruthy();
    });
});
