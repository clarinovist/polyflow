// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/actions/finance/aging-actions', () => ({
    getAgingSummary: vi.fn(),
}));

import { AgingTable } from '../page';

const row = {
    partnerId: 'partner-1',
    partnerName: 'Mitra Uji',
    type: 'AR' as const,
    notYetDue: 100_000,
    current: 200_000,
    days31to60: 300_000,
    days61to90: 400_000,
    over90: 500_000,
    total: 1_500_000,
    invoices: [],
};

describe('AgingTable', () => {
    it('groups every overdue range under an explicit header', () => {
        render(
            <AgingTable
                data={[row]}
                loading={false}
                title="Aging Piutang"
                description="Saldo outstanding dari Customer."
                partnerNameHeader="Customer"
                type="AR"
            />,
        );

        const table = screen.getByRole('table');
        const overdueGroup = within(table).getByRole('columnheader', {
            name: /Jatuh Tempo & Terlambat/,
        });

        expect(overdueGroup.getAttribute('colspan')).toBe('4');
        expect(
            within(table).getByRole('columnheader', {
                name: 'Belum Jatuh Tempo',
            }),
        ).toBeTruthy();
        expect(
            within(table).getByRole('columnheader', { name: '0-30 Hari' }),
        ).toBeTruthy();
        expect(
            within(overdueGroup).getByRole('button', {
                name: 'Info kelompok jatuh tempo dan terlambat',
            }),
        ).toBeTruthy();
    });
});
