import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { cogsEconomicDiagnosisEvidence, inventoryEconomicDiagnosisEvidence, invoiceSelectionEvidence, invoiceDiagnosisEvidence, reconciliationEvidence } from '../finance-evidence';
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
        expect(evidenceToText(evidence)).toContain('BUKAN bukti semua shipment');
        expect(evidenceToText(evidence)).toContain('diagnose_cogs_economic_completeness');
        expect(evidence.entities).toEqual([]);
    });
    it('renders focused COGS diagnosis in required order without combining incompatible bases', () => {
        const evidence = cogsEconomicDiagnosisEvidence({
            range,
            bookkeeping: { reportCogs: 0, journalCogs: 0, difference: 0 },
            coverage: { mandatoryComplete: false, confidenceCap: 0.75, dimensions: [{ code: 'SHIPMENT_HISTORICAL_VALUATION', status: 'partial', reason: 'fallback source unknown' }] },
            findings: [{ code: 'SHIPMENT_JOURNAL_MISSING', conditionStatus: 'confirmed', accountingConclusion: 'needs_review', area: 'shipment', amountBasis: 'explicit_movement_cost', count: 1, amount: 300, nominal: 300, revenuePercentage: 30, sourceId: 'movement-1', materiality: 300, reason: 'Movement has no journal.', evidenceLimit: 'Accounting correction needs review.', samples: [{ sourceId: 'movement-1', materiality: 300, amount: 300, reason: 'sample' }] }],
            shipments: { count: 2, activeCount: 1, coveredCount: 0, reversedCount: 0, offBalanceCount: 1, quantity: 2, nominalSalesValue: 1000, incompleteSalesValue: 1000, postedCogsValue: 0, explicitMovementValue: { amount: 300, knownCount: 1 }, historicalFallbackUnknownCount: 1 },
            returns: { count: 1, cohortBasis: { physicalReceiptInRange: 1, completedStateUpdatedInRange: 1 }, goodReceiptCount: 1, damagedReceiptCount: 1, physicalRestockValue: 100, activeCommercialCreditValue: 200, originalPostedRevenue: 1000, completedWithoutActiveCreditCount: 1, crossPeriodCount: 1 },
            productionFlow: { materialIssue: { count: 1, quantity: 2, movementValue: 250, journalValue: 300 }, wipToOutput: { outputCount: 1, quantity: 1, movementValue: 400, journalValue: 400 }, shipmentCogs: { count: 1, journalValue: 300, attribution: 'aggregate_only' }, returnCost: { count: 1, restockValue: 100 }, sideFlows: { scrapCount: 1, returnInCount: 1, adjustmentCount: 1, maklonOffBalanceCount: 1 }, crossPeriod: { outputWithIssueOutsideRange: 1, issueWithOutputOutsideRange: 0 }, unattributedShipmentCount: 1 },
            limitations: ['No lot lineage.'],
        });
        const text = evidenceToText(evidence);
        expect(evidence).toMatchObject({ completeness: 'partial', confidenceCap: 0.75, entities: [] });
        expect(evidence.facts[0].label).toBe('Urutan jawaban wajib');
        expect(text).toContain('CONFIRMED / NEEDS_REVIEW');
        expect(text).toContain('Coverage cap 0.75');
        expect(text).toContain('BUKAN probabilitas');
        expect(text).toContain('Kredit komersial tidak ditambahkan ke restock/HPP');
        expect(text).toContain('Jangan menyatakan equality atau lineage per unit');
        expect(text).toContain('movement-1');
    });
    it('renders inventory diagnosis in material-first order without mixing quantity, movement value and GL', () => {
        const evidence = inventoryEconomicDiagnosisEvidence({
            range,
            gl: { accountCount: 2, mappedProductCount: 2, unmappedProductCount: 1, openingBalance: 1000, periodDebit: 600, periodCredit: 400, closingBalance: 1200, rollforwardGap: 0, journalCount: 4, manualJournalCount: 1, orphanJournalCount: 1, closingReferenceCount: 1, scopeBasis: 'persisted_product_inventory_account_mapping' },
            movementCoverage: { count: 5, coveredCount: 2, unvaluedCount: 1, withoutJournalCount: 1, invalidJournalCount: 0, valueMismatchCount: 1, semanticRoleUnknownCount: 1, validReversalCount: 1, invalidReversalCount: 0, crossPeriodReversalCount: 1, quantities: [{ productVariantId: 'kg', unit: 'KG', inbound: 10, outbound: 2, transfer: 1 }, { productVariantId: 'pcs', unit: 'PCS', inbound: 3, outbound: 1, transfer: 0 }] },
            flows: { receipts: 1, shipments: 1, productionIssues: 1, productionOutputs: 0, goodReturns: 1, damagedReturns: 1, purchaseReturns: 1, adjustmentGains: 1, adjustmentLosses: 1, internalTransfers: 1, offBalanceExcluded: 1, materialCostRemainsInWip: 1 },
            coverage: { mandatoryComplete: false, confidenceCap: 0.75, dimensions: [{ code: 'MOVEMENT_VALUATION', status: 'partial', reason: 'cost unavailable' }], completenessReasons: ['MOVEMENT_VALUATION: cost unavailable'] },
            findings: [{ code: 'INVENTORY_MOVEMENT_WITHOUT_JOURNAL', conditionStatus: 'confirmed', accountingConclusion: 'needs_review', area: 'movement', flow: 'receipt', amountBasis: 'persisted_movement_value', count: 1, amount: 300, nominal: 300, glActivityPercentage: null, sourceId: 'movement-1', materiality: 300, reason: 'Movement has no journal.', evidenceLimit: 'Accounting correction needs review.', samples: [{ sourceId: 'movement-1', flow: 'receipt', unit: 'KG', amount: 300, materiality: 300, reason: 'sample' }] }],
            limitations: ['Current Inventory is not a historical snapshot.'],
        });
        const text = evidenceToText(evidence);
        expect(evidence).toMatchObject({ completeness: 'partial', confidenceCap: 0.75, entities: [] });
        expect(evidence.facts[0]).toMatchObject({
            label: 'Cara menjawab pengguna',
            value: expect.stringContaining('Kesimpulan → Penyebab utama → Yang perlu diperiksa → Batas pemeriksaan'),
        });
        expect(evidence.summary).toContain('belum otomatis berarti kesalahan pencatatan');
        expect(text).toContain('Pergerakan barang belum tercatat di pembukuan');
        expect(text).toContain('perlu ditentukan oleh tim Finance');
        expect(text).toContain('Angkanya dipisahkan per produk/satuan');
        expect(text).toContain('2 kombinasi produk dan satuan');
        const publicFacts = evidence.facts
            .filter(fact => !fact.label.startsWith('Detail teknis internal'))
            .map(fact => `${fact.label}: ${fact.value}`)
            .join(' ');
        expect(publicFacts).not.toMatch(/INVENTORY_[A-Z_]+|CONFIRMED|NEEDS_REVIEW|coverage_cap|amountBasis|movement-1|mapped inventory GL/i);
        const technical = evidence.facts.find(fact =>
            fact.label.startsWith('Detail teknis internal'),
        );
        expect(technical?.value).toContain('INVENTORY_MOVEMENT_WITHOUT_JOURNAL');
        expect(technical?.value).toContain('coverage_cap=0.75');
        expect(technical?.value).toContain('kg[KG]');
        expect(technical?.value).toContain('pcs[PCS]');
    });

    it('translates every known inventory finding code into business language', () => {
        const codes = [
            'ZERO_VALUED_INVENTORY_MOVEMENT',
            'MOVEMENT_JOURNAL_VALUE_MISMATCH',
            'INVENTORY_COST_POSTED_OUTSIDE_ASSET',
            'INVENTORY_JOURNAL_VECTOR_INVALID',
            'INVENTORY_JOURNAL_WITHOUT_MOVEMENT',
            'INVALID_INVENTORY_REVERSAL',
            'CROSS_PERIOD_INVENTORY_REVERSAL',
            'VALID_INVENTORY_REVERSAL',
            'INVENTORY_ADJUSTMENT_GAIN_LOSS',
            'TRANSFER_NON_FINANCIAL_EXPECTED',
            'OFF_BALANCE_MOVEMENT_EXCLUDED',
            'MATERIAL_COST_REMAINS_IN_WIP',
            'OPENING_INVENTORY_UNAVAILABLE',
            'STOCK_VALUE_BASIS_UNATTRIBUTED',
            'CLOSING_INVENTORY_JOURNAL_REVIEW',
        ];
        const base = {
            range,
            gl: { accountCount: 1, mappedProductCount: 1, unmappedProductCount: 0, openingBalance: 0, periodDebit: 0, periodCredit: 0, closingBalance: 0, rollforwardGap: 0, journalCount: 0, manualJournalCount: 0, orphanJournalCount: 0, closingReferenceCount: 0, scopeBasis: 'persisted_product_inventory_account_mapping' as const },
            movementCoverage: { count: 0, coveredCount: 0, unvaluedCount: 0, withoutJournalCount: 0, invalidJournalCount: 0, valueMismatchCount: 0, semanticRoleUnknownCount: 0, validReversalCount: 0, invalidReversalCount: 0, crossPeriodReversalCount: 0, quantities: [] },
            flows: { receipts: 0, shipments: 0, productionIssues: 0, productionOutputs: 0, goodReturns: 0, damagedReturns: 0, purchaseReturns: 0, adjustmentGains: 0, adjustmentLosses: 0, internalTransfers: 0, offBalanceExcluded: 0, materialCostRemainsInWip: 0 },
            coverage: { mandatoryComplete: false, confidenceCap: 0.75 as const, dimensions: [], completenessReasons: [] },
            limitations: [],
        };
        for (const code of codes) {
            const evidence = inventoryEconomicDiagnosisEvidence({
                ...base,
                findings: [{ code, conditionStatus: 'confirmed', accountingConclusion: 'needs_review', area: 'movement', flow: 'shipment', amountBasis: 'none', count: 1, amount: 0, nominal: 0, glActivityPercentage: null, sourceId: null, materiality: 0, reason: 'technical reason', evidenceLimit: 'technical limit', samples: [] }],
            });
            const publicText = evidence.facts
                .filter(fact => !fact.label.startsWith('Detail teknis internal'))
                .map(fact => `${fact.label}: ${fact.value}`)
                .join(' ');
            expect(publicText).not.toContain(code);
            expect(publicText).not.toContain('technical reason');
        }
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
