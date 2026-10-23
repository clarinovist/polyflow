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

const INVENTORY_FINDING_LANGUAGE: Record<
    string,
    { title: string; explanation: string }
> = {
    INVENTORY_MOVEMENT_WITHOUT_JOURNAL: {
        title: 'Pergerakan barang belum tercatat di pembukuan',
        explanation: 'Pergerakan barang memiliki nilai, tetapi jurnal persediaannya belum ditemukan.',
    },
    ZERO_VALUED_INVENTORY_MOVEMENT: {
        title: 'Biaya pergerakan barang belum tersedia',
        explanation: 'Nilai biaya tersimpan nol atau belum tersedia; ini tidak berarti jumlah atau nilai barang pasti nol.',
    },
    MOVEMENT_JOURNAL_VALUE_MISMATCH: {
        title: 'Nilai pergerakan dan jurnal berbeda',
        explanation: 'Nilai biaya pada pergerakan barang berbeda dari nilai jurnal persediaan yang terkait.',
    },
    INVENTORY_COST_POSTED_OUTSIDE_ASSET: {
        title: 'Jurnal menggunakan akun persediaan yang berbeda',
        explanation: 'Sisi persediaan pada jurnal tidak menggunakan akun persediaan yang dipetakan untuk produk tersebut.',
    },
    INVENTORY_JOURNAL_VECTOR_INVALID: {
        title: 'Susunan jurnal persediaan perlu diperiksa',
        explanation: 'Status, keseimbangan, atau sisi debit dan kredit jurnal belum sesuai dengan alur barangnya.',
    },
    INVENTORY_JOURNAL_WITHOUT_MOVEMENT: {
        title: 'Jurnal belum dapat ditautkan ke pergerakan barang',
        explanation: 'Jurnal persediaan ditemukan, tetapi sumber pergerakan barangnya belum dapat ditentukan secara pasti.',
    },
    INVALID_INVENTORY_REVERSAL: {
        title: 'Pembalikan transaksi perlu diperiksa',
        explanation: 'Pasangan transaksi atau jurnal pembaliknya belum dapat dibuktikan secara pasti.',
    },
    CROSS_PERIOD_INVENTORY_REVERSAL: {
        title: 'Pembalikan transaksi melewati periode',
        explanation: 'Transaksi asal dan pembalikannya berada pada periode yang berbeda sehingga tidak boleh saling menghapus diam-diam.',
    },
    VALID_INVENTORY_REVERSAL: {
        title: 'Pembalikan transaksi sudah berpasangan',
        explanation: 'Transaksi asal dan pembalikannya berhasil dipasangkan dan tidak dihitung dua kali.',
    },
    INVENTORY_ADJUSTMENT_GAIN_LOSS: {
        title: 'Ada penyesuaian stok',
        explanation: 'Penyesuaian memengaruhi nilai persediaan dan selisih untung atau rugi; ini bukan otomatis pemakaian bahan.',
    },
    TRANSFER_NON_FINANCIAL_EXPECTED: {
        title: 'Perpindahan antar-lokasi tidak mengubah nilai perusahaan',
        explanation: 'Barang hanya berpindah lokasi internal sehingga tidak diharapkan menimbulkan untung atau rugi.',
    },
    OFF_BALANCE_MOVEMENT_EXCLUDED: {
        title: 'Barang Maklon atau milik pelanggan sudah dipisahkan',
        explanation: 'Pergerakan ini tidak diperlakukan sebagai persediaan milik perusahaan.',
    },
    MATERIAL_COST_REMAINS_IN_WIP: {
        title: 'Biaya bahan masih mungkin berada dalam proses produksi',
        explanation: 'Bahan sudah dipakai, tetapi hasil produksinya belum terlihat pada periode yang sama; biaya belum otomatis menjadi HPP.',
    },
    OPENING_INVENTORY_UNAVAILABLE: {
        title: 'Nilai awal persediaan belum dapat dipastikan',
        explanation: 'Data yang tersedia belum cukup untuk menghitung nilai awal persediaan secara historis.',
    },
    STOCK_VALUE_BASIS_UNATTRIBUTED: {
        title: 'Sumber nilai persediaan belum dapat dipastikan',
        explanation: 'Akun atau dokumen sumber nilai belum dapat ditautkan secara pasti.',
    },
    CLOSING_INVENTORY_JOURNAL_REVIEW: {
        title: 'Jurnal tutup buku menyentuh persediaan',
        explanation: 'Jurnal tetap masuk dalam saldo persediaan, tetapi tujuannya perlu ditinjau oleh Finance.',
    },
};

function inventoryFindingLanguage(code: string) {
    return INVENTORY_FINDING_LANGUAGE[code] ?? {
        title: 'Kondisi persediaan perlu diperiksa',
        explanation: 'Data menunjukkan kondisi yang perlu ditelusuri lebih lanjut.',
    };
}

function inventoryAmountBasisLabel(basis: string): string {
    if (basis === 'posted_inventory_gl') return 'nilai jurnal persediaan';
    if (basis === 'persisted_movement_value')
        return 'nilai biaya yang tersimpan pada pergerakan barang';
    if (basis === 'document_return_value') return 'nilai dokumen retur';
    return 'nilai yang belum dapat ditentukan';
}

function inventoryFlowLabel(flow: string): string {
    const labels: Record<string, string> = {
        receipt: 'penerimaan barang',
        shipment: 'pengeluaran barang untuk penjualan',
        production_issue: 'pemakaian bahan produksi',
        internal_usage: 'pemakaian internal barang operasional',
        production_output: 'hasil produksi',
        production_return_in: 'pengembalian bahan produksi',
        sales_return_good: 'retur penjualan yang kembali ke stok',
        return_in: 'barang kembali masuk',
        purchase_return: 'retur pembelian',
        adjustment_gain: 'penyesuaian stok masuk',
        adjustment_loss: 'penyesuaian stok keluar',
        transfer: 'perpindahan antar-lokasi',
        journal: 'jurnal persediaan',
        opening: 'nilai awal persediaan',
    };
    return labels[flow] ?? 'pergerakan barang';
}

export function inventoryEconomicDiagnosisEvidence(
    result: Awaited<ReturnType<typeof diagnoseInventoryEconomicCompleteness>>,
) {
    const { range, gl, movementCoverage, flows, coverage, findings } = result;
    const findingFacts = findings.map(finding => {
        const language = inventoryFindingLanguage(finding.code);
        const amount = finding.amountBasis === 'none'
            ? ''
            : ` Nilai yang teridentifikasi ${money(finding.nominal)} berdasarkan ${inventoryAmountBasisLabel(finding.amountBasis)}.`;
        return {
            label: `Temuan: ${language.title}`,
            value: `${finding.count} kejadian pada ${inventoryFlowLabel(finding.flow)}.${amount} ${language.explanation} Kondisi ini terlihat pada data, tetapi kebutuhan koreksi tetap perlu ditentukan oleh tim Finance.`,
        };
    });
    const technicalDetail = findings.map(finding =>
        `${finding.code}; status=confirmed; conclusion=needs_review; flow=${finding.flow}; basis=${finding.amountBasis}; count=${finding.count}; amount=${finding.nominal}; samples=${finding.samples.map(sample => sample.sourceId).join(',') || '-'}`,
    ).join(' | ');
    const technicalQuantities = movementCoverage.quantities.map(row =>
        `${row.productVariantId}[${row.unit}]:in=${row.inbound},out=${row.outbound},transfer=${row.transfer}`,
    ).join(',') || '-';
    return createEvidence({
        summary: `Catatan persediaan ${range.startDate} s.d. ${range.endDate} WIB sudah diperiksa. Ditemukan ${findings.length} kelompok kondisi yang perlu ditinjau; temuan ini belum otomatis berarti kesalahan pencatatan.`,
        source: 'tenant-data',
        completeness: coverage.mandatoryComplete ? 'complete' : 'partial',
        confidenceCap: coverage.confidenceCap,
        facts: [
            { label: 'Cara menjawab pengguna', value: 'Gunakan bahasa bisnis sehari-hari dengan urutan: Kesimpulan → Penyebab utama → Yang perlu diperiksa → Batas pemeriksaan. Jangan tampilkan kode kondisi, confidence cap, amount basis, nama kolom, atau istilah teknis mentah kecuali pengguna meminta detail teknis.' },
            { label: 'Status pemeriksaan', value: coverage.mandatoryComplete ? 'Seluruh pemeriksaan wajib yang tersedia telah selesai.' : 'Pemeriksaan masih memiliki batas data dan penelusuran, sehingga belum mencakup seluruh pergerakan barang secara pasti.' },
            { label: 'Catatan nilai persediaan', value: `${gl.accountCount} akun persediaan berhasil dikenali dari ${gl.mappedProductCount} pemetaan produk; ${gl.unmappedProductCount} produk belum memiliki pemetaan. Saldo awal ${money(gl.openingBalance)}, penambahan ${money(gl.periodDebit)}, pengurangan ${money(gl.periodCredit)}, dan saldo akhir ${money(gl.closingBalance)}. Ada ${gl.orphanJournalCount} jurnal yang belum dapat ditautkan ke pergerakan barang tertentu.` },
            { label: 'Kecocokan pergerakan barang dan pembukuan', value: `${movementCoverage.count} pergerakan diperiksa: ${movementCoverage.coveredCount} berhasil dicocokkan, ${movementCoverage.withoutJournalCount} belum memiliki jurnal terkait, ${movementCoverage.unvaluedCount} belum memiliki biaya yang dapat dipastikan, ${movementCoverage.invalidJournalCount} memiliki susunan jurnal yang perlu diperiksa, dan ${movementCoverage.valueMismatchCount} memiliki perbedaan nilai.` },
            { label: 'Alur barang yang diperiksa', value: `Penerimaan ${flows.receipts}; pengeluaran untuk penjualan ${flows.shipments}; pemakaian bahan produksi ${flows.productionIssues}; hasil produksi ${flows.productionOutputs}; retur layak jual ${flows.goodReturns}; retur rusak tanpa kembali ke stok ${flows.damagedReturns}; retur pembelian ${flows.purchaseReturns}; penyesuaian masuk/keluar ${flows.adjustmentGains}/${flows.adjustmentLosses}; perpindahan internal ${flows.internalTransfers}; barang Maklon atau milik pelanggan ${flows.offBalanceExcluded}; pemakaian bahan tanpa hasil produksi pada periode yang sama ${flows.materialCostRemainsInWip}.` },
            { label: 'Jumlah barang', value: movementCoverage.quantities.length ? `Jumlah barang tersedia untuk ${movementCoverage.quantities.length} kombinasi produk dan satuan. Angkanya dipisahkan per produk/satuan, tidak digabung lintas satuan, dan tidak disamakan dengan nilai rupiah.` : 'Tidak ada pergerakan jumlah barang pada periode ini.' },
            ...findingFacts,
            { label: 'Batas pemeriksaan utama', value: 'Nilai awal persediaan historis, biaya yang tidak tersimpan, transaksi lintas periode, dan hubungan sumber transaksi tertentu belum selalu dapat ditentukan secara pasti. Karena itu, kondisi yang ditemukan perlu ditinjau sebelum dianggap sebagai kesalahan accounting.' },
            { label: 'Detail teknis internal — tampilkan hanya jika pengguna memintanya', value: `coverage_cap=${coverage.confidenceCap}; dimensions=${coverage.dimensions.map(item => `${item.code}:${item.status}`).join(',')}; completeness_reasons=${coverage.completenessReasons.join('|') || '-'}; findings=${technicalDetail || '-'}; quantities=${technicalQuantities}; limitations=${result.limitations.join('|')}` },
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
