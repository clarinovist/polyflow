// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReturnDetailOverview } from '../ReturnDetailOverview';
import { ReturnAuditDetails, ReturnCreditHistory, ReturnInvoiceDetails } from '../ReturnDetailRecords';
import { returnCreditPresentation } from '../ReturnStatusBadge';
import { creditFixture, returnFixture } from './return-fixtures';
import { formatRupiah as currency } from '@/lib/utils/utils';
const formatRupiah = (value: number) => currency(value).replace(/\s/g, ' ');

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

function activeMetric() {
    return screen.getByText('Kredit piutang aktif').parentElement!;
}

describe('Return presentation keeps document, physical and financial states distinct', () => {
    it.each([
        { status: 'DRAFT', label: 'Belum dikreditkan' },
        { status: 'CONFIRMED', label: 'Belum dikreditkan' },
        { status: 'RECEIVED', label: 'Siap diperiksa Finance' },
        { status: 'COMPLETED', label: 'Siap diperiksa Finance' },
        { status: 'CANCELLED', label: 'Tidak dikreditkan' },
    ] as const)('does not treat $status as posted credit', ({ status, label }) => {
        const row = returnFixture({ status });
        expect(returnCreditPresentation(row).label).toBe(label);
        render(<ReturnDetailOverview row={row} />);
        expect(within(activeMetric()).getByText(formatRupiah(0))).toBeTruthy();
    });

    it('keeps review-required credit unposted even without a review reason', () => {
        const row = returnFixture({ status: 'COMPLETED', credit: creditFixture({ status: 'REVIEW_REQUIRED', reviewReason: null, postedAt: null }) });
        render(<ReturnDetailOverview row={row} />);
        expect(screen.getByRole('status').textContent).toContain('Perlu pemeriksaan Finance');
        expect(within(activeMetric()).getByText(formatRupiah(0))).toBeTruthy();
    });

    it('shows a reversed credit as inactive, even when operationally completed', () => {
        const row = returnFixture({ status: 'COMPLETED', credit: creditFixture({ status: 'REVERSED', reversedAt: '2026-10-23T00:00:00Z', reversalReason: 'Harga tidak cocok' }) });
        render(<ReturnDetailOverview row={row} />);
        expect(screen.getByRole('status').textContent).toContain('Harga tidak cocok');
        expect(screen.getByRole('status').textContent).toContain('Kredit tidak aktif');
        expect(within(activeMetric()).getByText(formatRupiah(0))).toBeTruthy();
        expect(returnCreditPresentation(row).label).toBe('Dibalik · perlu dicek');
    });

    it('shows active recovery separately from historical reversal', () => {
        const row = returnFixture({ status: 'COMPLETED', credit: creditFixture({ status: 'REVERSED', recoveryActive: true }) });
        render(<ReturnDetailOverview row={row} />);
        expect(screen.getByRole('status').textContent).toContain('Kredit dipulihkan');
        expect(within(activeMetric()).getByText(formatRupiah(2380000))).toBeTruthy();
        expect(returnCreditPresentation(row).label).toBe('Kredit dipulihkan');
    });

    it('does not equate customer balance issuance with an invoice deduction', () => {
        const row = returnFixture({ status: 'COMPLETED', customerCredit: { id: 'wallet', status: 'POSTED' } });
        render(<ReturnDetailOverview row={row} />);
        expect(screen.getByRole('status').textContent).toContain('bukan pembayaran atau pemotongan invoice otomatis');
        expect(screen.queryByText('Kredit piutang aktif')).toBeNull();
        expect(screen.getByRole('link', { name: 'Lihat saldo & pemakaian' }).getAttribute('href')).toBe('/finance/returns/credits/wallet');
    });

    it('has honest missing-invoice and cancelled states', () => {
        render(<ReturnDetailOverview row={returnFixture({ status: 'CANCELLED', invoices: [] })} />);
        expect(screen.getByText('Belum ada invoice terkait. Bukan berarti tagihan lunas.')).toBeTruthy();
        expect(screen.getByText(/Tahapan operasional tidak dilanjutkan/)).toBeTruthy();
        expect(screen.queryByText(/Menunggu penerimaan/)).toBeNull();
    });

    it('renders separate remaining balances for multiple invoices, including draft caveats', () => {
        const row = returnFixture();
        row.invoices.push({ ...row.invoices[0], id: 'draft', invoiceNumber: 'INV-DRAFT', status: 'DRAFT', remaining: '500.00' });
        render(<><ReturnDetailOverview row={row} /><ReturnInvoiceDetails row={row} /></>);
        expect(screen.getByText('Sisa tagihan · INV-DRAFT')).toBeTruthy();
        expect(screen.getByText('Invoice draft; belum diakui sebagai piutang.')).toBeTruthy();
        const ledger = screen.getByRole('region', { name: 'Rincian INV-2026-0100' });
        expect(within(ledger).getByText('Penyesuaian harga')).toBeTruthy();
        expect(within(ledger).getByRole('link').getAttribute('href')).toBe('/finance/invoices/sales/invoice-example');
    });

    it('preserves posting/reversal/recovery evidence in history and collapsed audit with WIB dates', () => {
        const row = returnFixture({ credit: creditFixture({ status: 'REVERSED', reversedAt: '2026-10-23T01:00:00Z', reversalReason: 'Harga tidak cocok', recoveries: [{ kind: 'REINSTATE', postingDate: '2026-10-24T00:00:00Z', reason: 'Pemeriksaan selesai', evidence: 'RECOVERY-EVIDENCE', journal: { entryNumber: 'JE-EXAMPLE' } }] }) });
        const { container } = render(<><ReturnCreditHistory row={row} /><ReturnAuditDetails row={row} /></>);
        expect(screen.getByText(/Kredit .* terposting/)).toBeTruthy();
        expect(screen.getByText(/2026-10-23 · Disetujui manual/)).toBeTruthy();
        expect(screen.getByText('Harga tidak cocok')).toBeTruthy();
        expect(screen.getByText('Pemulihan kredit retur')).toBeTruthy();
        const disclosure = container.querySelector('details')!;
        expect(disclosure.open).toBe(false);
        fireEvent.click(screen.getByText('Detail audit & catatan sistem'));
        expect(disclosure.open).toBe(true);
        expect(screen.getByText('EVIDENCE-EXAMPLE')).toBeTruthy();
        expect(screen.getByText('Bukti: RECOVERY-EVIDENCE')).toBeTruthy();
        expect(screen.getByText('Petugas Contoh')).toBeTruthy();
        expect(screen.getByText('Snapshot invoice asal', { exact: false })).toBeTruthy();
    });
});
