import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { invoiceSelectionEvidence, invoiceDiagnosisEvidence, reconciliationEvidence } from '../finance-evidence';
import { evidenceToText } from '../evidence';
const dec = (n: number) => new Prisma.Decimal(n);
const invoice = { id: 'i', invoiceNumber: 'INV-1', status: 'PAID' as const, totalAmount: dec(100), paidAmount: dec(100), creditedAmount: dec(0), priceAdjustmentAmount: dec(0), invoiceDate: new Date('2026-08-31T17:00:00Z'), dueDate: null, salesOrder: { customer: { name: 'Customer' } } };
const selection = { kind: 'selected' as const, invoices: [invoice], total: 1, truncated: false };
const report = { revenue: [], cogs: [], opex: [], other: [], totalRevenue: 1000, totalManufacturingCosts: 300, inventoryChange: 0, totalCOGS: 300, grossProfit: 700, totalOpEx: 50, operatingIncome: 650, totalOther: -10, netIncome: 640 };
const range = { startDate: '2026-08-01', endDate: '2026-08-31', start: new Date('2026-07-31T17:00:00Z'), end: new Date('2026-08-31T16:59:59.999Z') };
const recon = { range, report, cogs: { rows: [], count: 0, total: 0, truncated: false }, invoices: { rows: [], count: 0, total: 0, truncated: false }, cogsDifference: 0 };

describe('finance evidence delivered to the model', () => {
    it('explains ambiguity, missing documents and uses WIB, not server timezone', () => {
        expect(invoiceSelectionEvidence({ ...selection, kind: 'missing', invoices: [], total: 0 }).completeness).toBe('partial');
        expect(invoiceDiagnosisEvidence({ selection: { ...selection, kind: 'ambiguous' }, diagnosis: undefined }).summary).toContain('ambigu');
        const result = invoiceSelectionEvidence(selection);
        expect(result.completeness).toBe('complete');
        expect(evidenceToText(result)).toContain('2026-09-01 WIB');
        expect(result.entities?.[0].href).toBe('/finance/invoices/sales/i');
        expect(evidenceToText(invoiceSelectionEvidence({ ...selection, invoices: [{ ...invoice, salesOrder: { customer: null }, dueDate: new Date('2026-09-02Z') }] }))).toContain('Tanpa customer');
    });
    it('includes payment and journal source documents, amounts and uncertainty rather than paid=healthy', () => {
        const diagnosis = {
            paymentTotal: 80, paymentCount: 25, payments: [{ id: 'p', paymentNumber: 'PAY', paymentDate: new Date('2026-08-01Z'), amount: dec(80), method: 'Cash' }],
            journals: [{ id: 'j', entryNumber: 'JE', entryDate: new Date('2026-08-01Z'), status: 'DRAFT', referenceType: 'SALES_INVOICE', referenceId: 'i', lines: [{ accountId: 'ar', debit: dec(100), credit: dec(0) }] }],
            journalCount: 21, periods: [{ key: '2026-08', status: 'CLOSED' }], ar: { id: 'ar', code: 'AR', name: 'Receivable' }, issues: ['PAYMENT_TOTAL_MISMATCH'], truncated: true,
        } as unknown as NonNullable<Parameters<typeof invoiceDiagnosisEvidence>[0]['diagnosis']>;
        const evidence = invoiceDiagnosisEvidence({ selection, diagnosis });
        const text = evidenceToText(evidence);
        expect(text).toContain('PAYMENT_TOTAL_MISMATCH'); expect(text).toContain('80,00'); expect(text).toContain('CLOSED');
        expect(text).toContain('AR kandidat neto Rp');
        expect(text).toContain('Mapping akun pusat tidak diperiksa'); expect(text).toContain('Sampel dipotong');
        expect(evidence.completeness).toBe('partial');
        expect(evidence.entities?.map(e => e.type)).toEqual(['Invoice', 'Payment', 'JournalEntry']);
        const noIssues = invoiceDiagnosisEvidence({ selection, diagnosis: { ...diagnosis, issues: [], ar: undefined, truncated: false } });
        expect(evidenceToText(noIssues)).toContain('bukan sertifikasi'); expect(evidenceToText(noIssues)).toContain('Akun tidak ditemukan');
    });
    it('delivers all P&L totals, source ids and explicit cohort limitations to evidenceToText', () => {
        const input = { ...recon, cogs: { rows: [{ id: 'j', entryNumber: 'JE', entryDate: range.start, reference: null, referenceId: null, referenceType: null, net: dec(-20), totalCount: BigInt(1), totalNet: dec(-20) }], count: 1, total: -20, truncated: false },
            invoices: { rows: [{ ...invoice, customer: null, allocatedCredit: dec(0), allocatedAdjustment: dec(0), paymentTotal: dec(0), activeJournals: BigInt(0), postedJournals: BigInt(0), draftJournals: BigInt(0), totalCount: BigInt(1), totalValue: dec(100) }], count: 1, total: 100, truncated: false } };
        const evidence = reconciliationEvidence(input);
        expect(evidenceToText(evidence)).toContain('640,00'); expect(evidenceToText(evidence)).toContain('-Rp');
        expect(evidenceToText(evidence)).toContain('BUKAN tambahan laba'); expect(evidenceToText(evidence)).toContain('Tanggal jurnal');
        expect(evidenceToText(evidence)).toContain('bukan audit nominal/periode');
        expect(evidence.entities?.map(e => e.id)).toEqual(['j', 'i']);
    });
    it('caps account evidence, preserves report totals and signals any partial dimension', () => {
        const accounts = Array.from({ length: 22 }, (_, n) => ({ id: `a${n}`, code: `A${n}`, name: 'Account', type: 'EXPENSE' as const, category: 'COGS' as const, netBalance: n }));
        const input = { ...recon, report: { ...report, cogs: accounts } };
        const evidence = reconciliationEvidence(input);
        expect(evidence.completeness).toBe('partial');
        expect(evidence.facts.filter(f => f.label.startsWith('Akun'))).toHaveLength(20);
        expect(evidence.facts.find(f => f.label === 'COGS/HPP')?.value).toContain('300,00');
        expect(accounts[0].id).toBe('a0');
        expect(reconciliationEvidence({ ...recon, cogsDifference: 1 }).completeness).toBe('partial');
        expect(reconciliationEvidence({ ...recon, cogs: { ...recon.cogs, truncated: true } }).completeness).toBe('partial');
        expect(reconciliationEvidence({ ...recon, invoices: { ...recon.invoices, truncated: true } }).completeness).toBe('partial');
        expect(reconciliationEvidence(recon).completeness).toBe('complete');
    });
});
