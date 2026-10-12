import { Prisma } from '@prisma/client';
import type { diagnoseInvoice, findInvoices } from '@/services/finance/invoice-diagnosis-service';
import type { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import type { diagnoseCogsEconomicCompleteness } from '@/services/finance/cogs-economic-diagnosis-service';
import type { diagnoseInventoryEconomicCompleteness } from '@/services/finance/inventory-economic-diagnosis-service';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { createEvidence } from './evidence';

const money = (value: unknown) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(Number(value));
const date = (value: Date | null) => value ? `${toBusinessDateString(value)} WIB` : '-';
const invoiceEntity = (i: { id: string; invoiceNumber: string }) => ({ type: 'Invoice', id: i.id, label: i.invoiceNumber, href: `/finance/invoices/sales/${encodeURIComponent(i.id)}` });

export function invoiceSelectionEvidence(result: Awaited<ReturnType<typeof findInvoices>>) {
    return createEvidence({
        summary: result.kind === 'missing' ? 'Invoice tidak ditemukan.' : result.kind === 'ambiguous'
            ? `Ditemukan ${result.total} invoice. Pilih nomor/id invoice persis; diagnosis tidak dijalankan untuk match ambigu.` : 'Status invoice ditemukan.',
        facts: result.invoices.map(i => ({ label: i.invoiceNumber, value: `${i.status} — ${i.salesOrder.customer?.name ?? 'Tanpa customer'} — Total ${money(i.totalAmount)}, dibayar ${money(i.paidAmount)}, kredit retur ${money(i.creditedAmount ?? 0)}, penyesuaian harga ${money(i.priceAdjustmentAmount ?? 0)}, sisa ${money(Number(i.totalAmount) + Number(i.priceAdjustmentAmount ?? 0) - Number(i.paidAmount) - Number(i.creditedAmount ?? 0))}; tanggal ${date(i.invoiceDate)}, jatuh tempo ${date(i.dueDate)}` })),
        entities: result.invoices.map(invoiceEntity), source: 'tenant-data',
        completeness: result.kind === 'selected' && !result.truncated ? 'complete' : 'partial',
    });
}

export function invoiceDiagnosisEvidence(result: Awaited<ReturnType<typeof diagnoseInvoice>>) {
    const base = invoiceSelectionEvidence(result.selection);
    const d = result.diagnosis;
    if (!d) return base;
    const issueText = d.issues.length ? d.issues.join('; ') : 'Tidak ada selisih pada pemeriksaan yang tercakup; bukan sertifikasi seluruh pembukuan.';
    return createEvidence({
        summary: `Diagnosis invoice ${result.selection.invoices[0].invoiceNumber}: ${d.issues.length} indikasi perlu diperiksa.`,
        source: 'tenant-data', completeness: 'partial',
        facts: [
            ...base.facts,
            { label: 'Pembayaran seluruh invoice', value: `${d.paymentCount} dokumen; total ${money(d.paymentTotal)}. Sampel ${d.payments.length}.` },
            { label: 'Jurnal aktif', value: `${d.journalCount} untuk invoice dan pembayaran sampel; ditampilkan ${d.journals.length}. VOIDED tidak dihitung.` },
            { label: 'Pemeriksaan', value: issueText },
            { label: 'Batas pemeriksaan AR', value: `${d.ar ? `${d.ar.code} ${d.ar.name}` : 'Akun tidak ditemukan'} adalah kandidat berdasarkan pola COA tenant. Mapping akun pusat tidak diperiksa; selisih AR perlu konfirmasi akuntan.` },
            { label: 'Cakupan', value: `${d.truncated ? 'Sampel dipotong; dokumen di luar sampel belum diperiksa.' : 'Semua dokumen terkait tercakup.'} DRAFT bukan otomatis laba hilang. Periode CLOSED pada jurnal POSTED tidak otomatis salah. Tidak ada perubahan data.` },
            ...d.periods.map(p => ({ label: `Periode ${p.key} WIB`, value: p.status })),
            ...d.payments.map(p => ({ label: `Payment ${p.paymentNumber}`, value: `${date(p.paymentDate)}; ${money(p.amount)}; ${p.method}` })),
            ...d.journals.map(j => {
                const arNet = j.lines.filter(l => l.accountId === d.ar?.id)
                    .reduce((total, l) => total.plus(l.debit).minus(l.credit), new Prisma.Decimal(0));
                return { label: `Jurnal ${j.entryNumber}`, value: `${j.status}; ${date(j.entryDate)}; ${j.referenceType} ${j.referenceId}; debit ${money(j.lines.reduce((n, l) => n + Number(l.debit), 0))}, kredit ${money(j.lines.reduce((n, l) => n + Number(l.credit), 0))}; AR kandidat neto ${d.ar ? money(arNet) : 'belum terverifikasi'} (debit-kredit)` };
            }),
        ],
        entities: [...(base.entities ?? []),
            ...d.payments.map(p => ({ type: 'Payment', id: p.id, label: p.paymentNumber })),
            ...d.journals.map(j => ({ type: 'JournalEntry', id: j.id, label: j.entryNumber, href: `/finance/journals/${encodeURIComponent(j.id)}` })),
        ],
    });
}

export function reconciliationEvidence(result: Awaited<ReturnType<typeof reconcileFinance>>) {
    const { range, report, cogs, invoices } = result;
    const totals = [
        ['Pendapatan usaha', report.totalRevenue], ['COGS/HPP', report.totalCOGS], ['Laba kotor', report.grossProfit],
        ['Beban operasional', report.totalOpEx], ['Laba operasi', report.operatingIncome], ['Lain-lain neto', report.totalOther], ['Laba bersih', report.netIncome],
    ] as const;
    const accounts = [...report.revenue, ...report.cogs, ...report.opex, ...report.other].filter(a => a.netBalance !== 0)
        .toSorted((a, b) => Math.abs(b.netBalance) - Math.abs(a.netBalance));
    return createEvidence({
        summary: `Rekonsiliasi laba-rugi/COGS ${range.startDate} s.d. ${range.endDate} WIB (read-only).`,
        source: 'tenant-data', completeness: cogs.truncated || invoices.truncated || accounts.length > 20 || result.cogsDifference !== 0 ? 'partial' : 'complete',
        facts: [
            { label: 'Basis laporan', value: 'Tanggal jurnal (entryDate) WIB; POSTED saja; kategori akun mengikuti laporan existing, bukan prefix COA; CLOSING- dan CLOSE- dikecualikan. Jurnal POSTED tanpa referensi (Reference NULL) tetap disertakan.' },
            ...totals.map(([label, value]) => ({ label, value: money(value) })),
            { label: 'Sumber COGS', value: `${cogs.count} jurnal, neto seluruhnya ${money(cogs.total)}; sampel ${cogs.rows.length} terbesar berdasarkan absolut neto. Penyesuaian negatif tetap disertakan.` },
            { label: 'Selisih laporan vs sumber COGS', value: money(result.cogsDifference) },
            { label: 'Batas kesimpulan COGS', value: 'Kesamaan ini hanya membuktikan konsistensi pembukuan/kategori COGS POSTED yang tercakup. Ini BUKAN bukti semua shipment, retur, issue produksi, output, adjustment, atau off-balance telah lengkap secara ekonomi; gunakan diagnose_cogs_economic_completeness.' },
            { label: 'Cohort invoice bermasalah', value: `${invoices.count} invoice; nilai dokumen ${money(invoices.total)}; sampel ${invoices.rows.length}. Filter tanggal invoice, bukan tanggal jurnal. Ini BUKAN tambahan laba atau estimasi laba hilang.` },
            { label: 'Batas pemeriksaan invoice', value: 'Screening jumlah/status jurnal penjualan dan agregat pembayaran saja; bukan audit nominal/periode semua jurnal. Gunakan diagnose_invoice_payment dengan nomor persis untuk pendalaman. DRAFT tanpa jurnal POSTED tidak dianggap laba hilang.' },
            { label: 'Cakupan dokumen', value: `${cogs.truncated || invoices.truncated || accounts.length > 20 ? 'Sampel dipotong; total dan jumlah tetap seluruh cohort.' : 'Sampel mencakup seluruh hasil.'} Tidak ada perbaikan otomatis atau perubahan data.` },
            ...accounts.slice(0, 20).map(a => ({ label: `Akun ${a.code} ${a.name}`, value: `${a.category}; neto ${money(a.netBalance)}` })),
            ...cogs.rows.map(j => ({ label: `COGS ${j.entryNumber}`, value: `${date(j.entryDate)}; ${money(j.net)}; sumber ${j.referenceType ?? '-'} ${j.referenceId ?? '-'} (${j.reference ?? '-'})` })),
            ...invoices.rows.map(i => ({ label: `Invoice ${i.invoiceNumber}`, value: `${i.customer ?? '-'}; ${i.status}; ${date(i.invoiceDate)}; total ${money(i.totalAmount)}; paidAmount ${money(i.paidAmount)}; Payment ${money(i.paymentTotal)}; jurnal aktif ${i.activeJournals}, POSTED ${i.postedJournals}, DRAFT ${i.draftJournals}` })),
        ],
        // Detail rows remain in facts for DeepSeek diagnosis. Do not promote
        // every sampled journal/invoice to UI entity chips on an aggregate P&L
        // answer; users can ask for document-level follow-up when needed.
        entities: [],
    });
}

export function inventoryEconomicDiagnosisEvidence(
    result: Awaited<ReturnType<typeof diagnoseInventoryEconomicCompleteness>>,
) {
    const { range, gl, movementCoverage, flows, coverage, findings } = result;
    const findingFacts = findings.map(finding => ({
        label: `${finding.code} — CONFIRMED / NEEDS_REVIEW`,
        value: `${finding.count} kejadian; flow ${finding.flow}; basis ${finding.amountBasis}; nominal ${money(finding.nominal)}${finding.glActivityPercentage == null ? '' : ` (${finding.glActivityPercentage.toFixed(2)}% dari total debit+kredit inventory GL periode)`}. ${finding.reason} Batas bukti: ${finding.evidenceLimit} Sampel ${finding.samples.length}: ${finding.samples.map(sample => `${sample.sourceId}${sample.unit ? ` [${sample.unit}]` : ''}`).join(', ') || '-'}.`,
    }));
    return createEvidence({
        summary: `Diagnosis Inventory GL vs economic stock flow ${range.startDate} s.d. ${range.endDate} WIB (read-only): ${findings.length} kelompok kondisi terkonfirmasi; implikasi accounting tetap needs_review.`,
        source: 'tenant-data',
        completeness: coverage.mandatoryComplete ? 'complete' : 'partial',
        confidenceCap: coverage.confidenceCap,
        facts: [
            { label: 'Urutan jawaban wajib inventory', value: 'Mulai dari penyebab material terbesar dalam basis yang sebanding → konsistensi mapped inventory GL → movement/journal coverage → valuation → jurnal tanpa source → WIP → return/transfer/adjustment/reversal → off-balance → confirmed vs needs_review → batas opening/cross-period/lineage/truncation.' },
            { label: 'Makna confidence inventory', value: `Coverage cap ${coverage.confidenceCap.toFixed(2)} adalah batas cakupan evidence, BUKAN probabilitas accounting benar.` },
            { label: 'Inventory GL mapped', value: `${gl.accountCount} akun dari ${gl.mappedProductCount} mapping produk; produk tanpa mapping ${gl.unmappedProductCount}; opening ${money(gl.openingBalance)}; debit periode ${money(gl.periodDebit)}; kredit periode ${money(gl.periodCredit)}; closing ${money(gl.closingBalance)}; roll-forward GL gap ${money(gl.rollforwardGap)}. Closing-reference tetap masuk balance-sheet GL (${gl.closingReferenceCount} jurnal), bukan dikecualikan seperti P&L.` },
            { label: 'Movement dan journal coverage', value: `${movementCoverage.count} movement; covered ${movementCoverage.coveredCount}; tanpa jurnal ${movementCoverage.withoutJournalCount}; zero/unavailable valuation ${movementCoverage.unvaluedCount}; journal invalid ${movementCoverage.invalidJournalCount}; value mismatch ${movementCoverage.valueMismatchCount}; semantic role/source unattributed ${movementCoverage.semanticRoleUnknownCount}; reversal valid ${movementCoverage.validReversalCount}, invalid ${movementCoverage.invalidReversalCount}, cross-period ${movementCoverage.crossPeriodReversalCount}.` },
            { label: 'Flow ekonomi inventory', value: `Receipt ${flows.receipts}; shipment ${flows.shipments}; issue produksi ${flows.productionIssues}; output produksi ${flows.productionOutputs}; GOOD return ${flows.goodReturns}; DAMAGED return tanpa restock ${flows.damagedReturns}; purchase return ${flows.purchaseReturns}; adjustment gain/loss ${flows.adjustmentGains}/${flows.adjustmentLosses}; transfer internal ${flows.internalTransfers}; off-balance ${flows.offBalanceExcluded}; issue tanpa output periode sama ${flows.materialCostRemainsInWip}. Issue material bukan otomatis COGS dan adjustment bukan otomatis consumption.` },
            { label: 'Quantity per variant/unit', value: `${movementCoverage.quantities.length ? movementCoverage.quantities.map(row => `${row.productVariantId} [${row.unit}]: in ${row.inbound}, out ${row.outbound}, transfer ${row.transfer}`).join('; ') : 'Tidak ada quantity movement pada periode.'} Quantity tidak dijumlahkan lintas variant/unit dan tidak disamakan dengan nilai.` },
            { label: 'Cakupan wajib inventory', value: `${coverage.mandatoryComplete ? 'Semua dimensi covered.' : 'Economic coverage masih partial.'} ${coverage.dimensions.map(item => `${item.code}=${item.status} (${item.reason})`).join('; ')}` },
            { label: 'Completeness reasons', value: coverage.completenessReasons.join('; ') || 'Tidak ada gap coverage wajib.' },
            ...findingFacts,
            ...result.limitations.map((value, index) => ({ label: `Batas inventory ${index + 1}`, value })),
        ],
        entities: [],
    });
}

export function cogsEconomicDiagnosisEvidence(
    result: Awaited<ReturnType<typeof diagnoseCogsEconomicCompleteness>>,
) {
    const { range, bookkeeping, coverage, findings, shipments, returns, productionFlow } = result;
    const findingFacts = findings.map(finding => ({
        label: `${finding.code} — CONFIRMED / NEEDS_REVIEW`,
        value: `${finding.count} kejadian; basis ${finding.amountBasis}; nominal ${money(finding.nominal)}${finding.revenuePercentage == null ? '' : ` (${finding.revenuePercentage.toFixed(2)}% dari nominal sales shipment)`}. ${finding.reason} Batas bukti: ${finding.evidenceLimit} Sampel ${finding.samples.length}: ${finding.samples.map(sample => sample.sourceId).join(', ') || '-'}.`,
    }));
    return createEvidence({
        summary: `Diagnosis kelengkapan ekonomi COGS ${range.startDate} s.d. ${range.endDate} WIB (read-only): ${findings.length} kelompok kondisi terkonfirmasi; implikasi accounting tetap needs_review.`,
        source: 'tenant-data',
        completeness: coverage.mandatoryComplete ? 'complete' : 'partial',
        confidenceCap: coverage.confidenceCap,
        facts: [
            { label: 'Urutan jawaban wajib', value: 'Ringkasan → temuan terkonfirmasi → implikasi needs_review → batas pemeriksaan → langkah berikutnya.' },
            { label: 'Makna confidence', value: `Coverage cap ${coverage.confidenceCap.toFixed(2)} adalah batas cakupan evidence, BUKAN probabilitas pembukuan benar.` },
            { label: 'Laporan vs jurnal COGS', value: `Laporan ${money(bookkeeping.reportCogs)}; jurnal POSTED kategori COGS ${money(bookkeeping.journalCogs)}; selisih ${money(bookkeeping.difference)}. Cocok hanya berarti konsisten secara pembukuan, belum tentu lengkap secara ekonomi.` },
            { label: 'Cakupan wajib', value: `${coverage.mandatoryComplete ? 'Semua dimensi covered.' : 'Belum semua dimensi covered.'} ${coverage.dimensions.map(item => `${item.code}=${item.status} (${item.reason})`).join('; ')}` },
            { label: 'Shipment', value: `${shipments.count} movement; aktif ${shipments.activeCount}; COGS tertutup ${shipments.coveredCount}; reversal ${shipments.reversedCount}; off-balance ${shipments.offBalanceCount}; qty ${shipments.quantity}; nominal sales ${money(shipments.nominalSalesValue)}; nilai sales dengan cost coverage belum lengkap ${money(shipments.incompleteSalesValue)}; jurnal COGS ${money(shipments.postedCogsValue)}; explicit movement value ${money(shipments.explicitMovementValue.amount)} pada ${shipments.explicitMovementValue.knownCount} movement. Basis nominal, movement, dan jurnal tidak boleh digabung.` },
            { label: 'Retur fisik vs komersial', value: `Cohort receipt dalam periode ${returns.cohortBasis.physicalReceiptInRange}; cohort transisi COMPLETED dalam periode ${returns.cohortBasis.completedStateUpdatedInRange}; GOOD ${returns.goodReceiptCount}, DAMAGED ${returns.damagedReceiptCount}; restock/HPP ${money(returns.physicalRestockValue)}; kredit komersial aktif ${money(returns.activeCommercialCreditValue)}; revenue asal POSTED ${money(returns.originalPostedRevenue)}; completed tanpa kredit aktif ${returns.completedWithoutActiveCreditCount}; cross-period ${returns.crossPeriodCount}. Kredit komersial tidak ditambahkan ke restock/HPP.` },
            { label: 'Aliran produksi agregat', value: `Issue ${productionFlow.materialIssue.count} (movement ${money(productionFlow.materialIssue.movementValue)}, GL ${money(productionFlow.materialIssue.journalValue)}); output ${productionFlow.wipToOutput.outputCount} (movement ${money(productionFlow.wipToOutput.movementValue)}, GL ${money(productionFlow.wipToOutput.journalValue)}); shipment/COGS ${productionFlow.shipmentCogs.count} / ${money(productionFlow.shipmentCogs.journalValue)}; unattributed ${productionFlow.unattributedShipmentCount}. Jangan menyatakan equality atau lineage per unit.` },
            { label: 'Side flow produksi', value: `Scrap ${productionFlow.sideFlows.scrapCount}; return-in ${productionFlow.sideFlows.returnInCount}; adjustment ${productionFlow.sideFlows.adjustmentCount}; Maklon off-balance ${productionFlow.sideFlows.maklonOffBalanceCount}; output dengan issue di luar periode ${productionFlow.crossPeriod.outputWithIssueOutsideRange}; issue dengan output di luar periode ${productionFlow.crossPeriod.issueWithOutputOutsideRange}.` },
            ...findingFacts,
            ...result.limitations.map((value, index) => ({ label: `Batas pemeriksaan ${index + 1}`, value })),
        ],
        entities: [],
    });
}
