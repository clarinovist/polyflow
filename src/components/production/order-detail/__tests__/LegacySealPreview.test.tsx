// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LegacySealPreview } from '../LegacySealPreview';

describe('LegacySealPreview', () => {
    afterEach(cleanup);

    it('renders frozen record counts, per-account signed balances with fallback ID, and Indonesian anomaly labels including unknown categories', () => {
        const onAcknowledgeChange = vi.fn();
        render(
            <LegacySealPreview
                outputCount={3}
                movementCount={8}
                materialIssueCount={2}
                scrapRecordCount={4}
                balances={[
                    {
                        accountId: 'acc-wip',
                        code: '1140',
                        name: 'Barang Dalam Proses',
                        amount: '-125000.50',
                    },
                    {
                        accountId: 'acc-missing',
                        code: null,
                        name: null,
                        amount: '40000.00',
                    },
                ]}
                anomalies={[
                    { category: 'VOIDED_EXECUTIONS', count: 1 },
                    { category: 'UNLINKED_REVERSALS_RETAINED', count: 2 },
                    { category: 'NEGATIVE_ACCOUNT_POOLS_RETAINED', count: 1 },
                    { category: 'JOURNALED_SCRAP_RETAINED', count: 1 },
                    { category: 'UNALLOCATED_SCRAP_RETAINED', count: 3 },
                    { category: 'NULL_SCRAP_COST_RETAINED', count: 2 },
                    { category: 'UNMAPPED_FUTURE_ANOMALY', count: 5 },
                ]}
                acknowledged={false}
                disabled={false}
                onAcknowledgeChange={onAcknowledgeChange}
            />,
        );

        expect(screen.getByText(/3 hasil/i)).toBeTruthy();
        expect(screen.getByText(/8 mutasi/i)).toBeTruthy();
        expect(screen.getByText(/2 catatan pengeluaran bahan/i)).toBeTruthy();
        expect(screen.getByText(/4 catatan affal/i)).toBeTruthy();

        expect(screen.getByText(/1140 — Barang Dalam Proses/)).toBeTruthy();
        expect(screen.getByText(/-Rp\s*125\.000,50 \(negatif\)/)).toBeTruthy();
        expect(screen.getByText(/acc-missing/)).toBeTruthy();
        expect(screen.getByText(/Rp\s*40\.000,00/)).toBeTruthy();

        expect(screen.getByText(/hasil pernah di-void/i)).toBeTruthy();
        expect(screen.getByText(/pembalik lama tanpa tautan sumber/i)).toBeTruthy();
        expect(screen.getByText(/saldo akun WIP negatif dipertahankan/i)).toBeTruthy();
        expect(screen.getByText(/affal berjurnal/i)).toBeTruthy();
        expect(screen.getByText(/affal tanpa atribusi hasil/i)).toBeTruthy();
        expect(screen.getByText(/affal tanpa biaya/i)).toBeTruthy();
        expect(screen.getByText(/UNMAPPED_FUTURE_ANOMALY/)).toBeTruthy();

        fireEvent.click(
            screen.getByLabelText(
                /Saya memahami anomali di atas tetap dipertahankan dan tidak direkonsiliasi/i,
            ),
        );
        expect(onAcknowledgeChange).toHaveBeenCalledWith(true);
    });
});
