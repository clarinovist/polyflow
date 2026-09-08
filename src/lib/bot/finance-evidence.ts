import { Prisma } from '@prisma/client';
import type { diagnoseInvoice, findInvoices } from '@/services/finance/invoice-diagnosis-service';
import type { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { createEvidence } from './evidence';

const money = (value: unknown) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(Number(value));
const date = (value: Date | null) => value ? `${toBusinessDateString(value)} WIB` : '-';
const invoiceEntity = (i: { id: string; invoiceNumber: string }) => ({ type: 'Invoice', id: i.id, label: i.invoiceNumber, href: `/finance/invoices/sales/${encodeURIComponent(i.id)}` });

export function invoiceSelectionEvidence(result: Awaited<ReturnType<typeof findInvoices>>) {
    return createEvidence({
        summary: result.kind === 'missing' ? 'Invoice tidak ditemukan.' : result.kind === 'ambiguous'
            ? `Ditemukan ${result.total} invoice. Pilih nomor/id invoice persis; diagnosis tidak dijalankan untuk match ambigu.` : 'Status invoice ditemukan.',
        facts: result.invoices.map(i => ({ label: i.invoiceNumber, value: `${i.status} — ${i.salesOrder.customer?.name ?? 'Tanpa customer'} — Total ${money(i.totalAmount)}, dibayar ${money(i.paidAmount)}, sisa ${money(Number(i.totalAmount) - Number(i.paidAmount))}; tanggal ${date(i.invoiceDate)}, jatuh tempo ${date(i.dueDate)}` })),
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
            { label: 'Basis laporan', value: 'Tanggal jurnal (entryDate) WIB; POSTED saja; kategori akun mengikuti laporan existing, bukan prefix COA; CLOSING- dan CLOSE- dikecualikan. Reference NULL mengikuti filter laporan existing (tidak termasuk).' },
            ...totals.map(([label, value]) => ({ label, value: money(value) })),
            { label: 'Sumber COGS', value: `${cogs.count} jurnal, neto seluruhnya ${money(cogs.total)}; sampel ${cogs.rows.length} terbesar berdasarkan absolut neto. Penyesuaian negatif tetap disertakan.` },
            { label: 'Selisih laporan vs sumber COGS', value: money(result.cogsDifference) },
            { label: 'Cohort invoice bermasalah', value: `${invoices.count} invoice; nilai dokumen ${money(invoices.total)}; sampel ${invoices.rows.length}. Filter tanggal invoice, bukan tanggal jurnal. Ini BUKAN tambahan laba atau estimasi laba hilang.` },
            { label: 'Batas pemeriksaan invoice', value: 'Screening jumlah/status jurnal penjualan dan agregat pembayaran saja; bukan audit nominal/periode semua jurnal. Gunakan diagnose_invoice_payment dengan nomor persis untuk pendalaman. DRAFT tanpa jurnal POSTED tidak dianggap laba hilang.' },
            { label: 'Cakupan dokumen', value: `${cogs.truncated || invoices.truncated || accounts.length > 20 ? 'Sampel dipotong; total dan jumlah tetap seluruh cohort.' : 'Sampel mencakup seluruh hasil.'} Tidak ada perbaikan otomatis atau perubahan data.` },
            ...accounts.slice(0, 20).map(a => ({ label: `Akun ${a.code} ${a.name}`, value: `${a.category}; neto ${money(a.netBalance)}` })),
            ...cogs.rows.map(j => ({ label: `COGS ${j.entryNumber}`, value: `${date(j.entryDate)}; ${money(j.net)}; sumber ${j.referenceType ?? '-'} ${j.referenceId ?? '-'} (${j.reference ?? '-'})` })),
            ...invoices.rows.map(i => ({ label: `Invoice ${i.invoiceNumber}`, value: `${i.customer ?? '-'}; ${i.status}; ${date(i.invoiceDate)}; total ${money(i.totalAmount)}; paidAmount ${money(i.paidAmount)}; Payment ${money(i.paymentTotal)}; jurnal aktif ${i.activeJournals}, POSTED ${i.postedJournals}, DRAFT ${i.draftJournals}` })),
        ],
        entities: [...cogs.rows.map(j => ({ type: 'JournalEntry', id: j.id, label: j.entryNumber, href: `/finance/journals/${encodeURIComponent(j.id)}` })), ...invoices.rows.map(invoiceEntity)],
    });
}
