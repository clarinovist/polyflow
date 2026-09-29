import { Prisma } from '@prisma/client';
import type { inspectPurchaseInvoice, inspectSalesReturnCredit } from '@/services/finance/assistant-document-diagnosis';
import { createEvidence } from './evidence';
import { documentSearchMeta } from './document-search';

const money = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value).toFixed(2);

export function purchaseInvoiceEvidence(result: Awaited<ReturnType<typeof inspectPurchaseInvoice>>, searchTerm: string) {
    const { invoices, diagnosis: d } = result;
    return createEvidence({
        summary: invoices.length === 0 ? 'Purchase invoice/BILL tidak ditemukan.' : invoices.length > 1
            ? `Ditemukan ${invoices.length >= 6 ? 'minimal ' : ''}${invoices.length} BILL. Sebutkan nomor/ID persis; diagnosis belum dilakukan karena ambigu.`
            : `Purchase invoice ${invoices[0].invoiceNumber}: ${invoices[0].status}.`,
        source: 'tenant-data', completeness: invoices.length !== 1 || !!d ? 'partial' : 'complete',
        searchMeta: documentSearchMeta(searchTerm, invoices.length),
        entities: invoices.map(i => ({ type: 'PurchaseInvoice', id: i.id, label: i.invoiceNumber, href: `/finance/invoices/purchase/${encodeURIComponent(i.id)}` })),
        facts: [
            ...invoices.map(i => ({ label: i.invoiceNumber, value: `Status ${i.status}; total Rp ${money(i.totalAmount)}; paidAmount Rp ${money(i.paidAmount)}; sisa Rp ${money(i.totalAmount.minus(i.paidAmount))}; PO ${i.purchaseOrder.orderNumber} (${i.purchaseOrder.status}); asal ${i.purchaseOrder.entrySource}; review ${i.purchaseOrder.commercialReviewStatus}; ${i.purchaseOrder._count.goodsReceipts} GR, ${i.purchaseOrder._count.invoices} BILL terkait.` })),
            ...(d ? [
                { label: 'Draft', value: d.draftExplanation ?? 'Bukan draft. Status tagihan tidak membuktikan jurnal sudah benar.' },
                { label: 'Penerimaan vs seluruh tagihan PO', value: `Nilai diterima menurut perhitungan invoice existing Rp ${money(d.receivedValue)}; ${d.billedCount} BILL non-cancelled termasuk draft Rp ${money(d.billedValue)}; selisih tagihan minus diterima Rp ${money(d.billedValue.minus(d.receivedValue))}. Bukan selisih invoice tunggal; perlu review, bukan otomatis korupsi.` },
                { label: 'Pembayaran', value: `PurchasePayment ${d.payments._count._all} dokumen Rp ${money(d.payments._sum.amount ?? 0)}; Payment ${d.legacyPayments._count._all} dokumen Rp ${money(d.legacyPayments._sum.amount ?? 0)}. Kedua jalur ditampilkan terpisah; jangan dijumlahkan karena mungkin merepresentasikan pembayaran yang sama.` },
                { label: 'Periode tanggal invoice', value: `${d.invoicePeriod}: ${d.invoicePeriodOpen ? 'OPEN' : 'CLOSED atau belum tersedia'}. Ini tanggal invoice, bukan persetujuan tanggal posting lain.` },
                { label: 'Jurnal aktif', value: d.journals.length ? d.journals.map(j => `${j.entryNumber} ${j.status}`).join('; ') : 'Belum ditemukan jurnal aktif PURCHASE_INVOICE.' },
                { label: 'Receipt', value: d.receipts.length ? d.receipts.map(r => r.receiptNumber).join('; ') : 'Belum ada GR terkait.' },
                { label: 'Batas pemeriksaan', value: 'Receipt dan jurnal maksimal 10 terbaru. Periode tiap jurnal, pajak, barter/remittance dan kecocokan seluruh pembayaran belum direkonsiliasi. Assistant tidak melakukan posting atau approval.' },
            ] : []),
        ],
    });
}

export function salesReturnCreditEvidence(result: Awaited<ReturnType<typeof inspectSalesReturnCredit>>, searchTerm: string) {
    const { returns, diagnosis: d } = result;
    return createEvidence({
        summary: returns.length === 0 ? 'Retur penjualan tidak ditemukan.' : returns.length > 1
            ? `Ditemukan ${returns.length >= 6 ? 'minimal ' : ''}${returns.length} retur. Sebutkan nomor/ID persis; diagnosis belum dilakukan karena ambigu.`
            : `Diagnosis kredit retur ${returns[0].returnNumber}: ${returns[0].status}.`,
        source: 'tenant-data', completeness: 'partial',
        searchMeta: documentSearchMeta(searchTerm, returns.length),
        entities: returns.map(r => ({ type: 'SalesReturn', id: r.id, label: r.returnNumber, href: `/finance/returns/${encodeURIComponent(r.id)}` })),
        facts: [
            ...returns.map(r => ({ label: r.returnNumber, value: `Status ${r.status}; SO ${r.salesOrder.orderNumber}; kredit retur ${r.credit ? `${r.credit.status} (${r.credit.mode})` : 'belum ada'}; saldo kredit customer ${r.customerCredit?.status ?? 'belum ada'}.` })),
            ...(d ? [
                { label: 'Usulan Finance', value: d.proposal.ready ? `Usulan tersedia untuk ${d.proposal.invoiceNumber}, nilai ${d.proposal.totalAmount}, sisa piutang ${d.proposal.remaining}. Tinjau dan konfirmasi sendiri di aplikasi.` : d.proposal.reason },
                { label: 'Periode tanggal posting yang diperiksa', value: `${d.postingDay} WIB: ${d.periodOpen ? 'OPEN' : 'CLOSED atau belum tersedia — posting tertahan'}. Jika tanggal posting berbeda, periksa ulang.` },
                { label: 'Bukti penerimaan', value: `${d.receivedItems}/${d.itemCount} item memiliki bukti receipt. Status diterima saja bukan bukti semua syarat posting lengkap.` },
                { label: 'Batas pemeriksaan', value: d.scope },
            ] : []),
        ],
    });
}
