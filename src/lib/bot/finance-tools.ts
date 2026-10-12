import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { diagnoseInvoice, findInvoices } from '@/services/finance/invoice-diagnosis-service';
import { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import { diagnoseCogsEconomicCompleteness } from '@/services/finance/cogs-economic-diagnosis-service';
import { diagnoseInventoryEconomicCompleteness } from '@/services/finance/inventory-economic-diagnosis-service';
import { financeRangeSchema, invoiceSearchSchema } from '@/services/finance/finance-diagnostic-input';
import type { AssistantToolDefinition, AssistantUserContext, ToolEvidence } from './assistant-types';
import { checkToolAuthorization } from './tool-authorization';
import { documentSearchMeta } from './document-search';
import { cogsEconomicDiagnosisEvidence, inventoryEconomicDiagnosisEvidence, invoiceDiagnosisEvidence, invoiceSelectionEvidence, reconciliationEvidence } from './finance-evidence';
import { inspectPurchaseInvoice, inspectSalesReturnCredit } from '@/services/finance/assistant-document-diagnosis';
import { purchaseInvoiceEvidence, salesReturnCreditEvidence } from './document-diagnosis-evidence';
import { financeLedgerQuerySchema } from '@/services/business-query/finance-ledger-query';
import { executeBusinessQuery } from '@/services/business-query/engine';
import { financeLedgerQueryEvidence } from './business-query-evidence';

function financeTool<T extends z.ZodType>(
    name: string, description: string, resource: string | string[], inputSchema: T,
    execute: (tx: Prisma.TransactionClient, input: z.output<T>) => Promise<ToolEvidence>,
): AssistantToolDefinition {
    const policy = { name, requiredResources: typeof resource === 'string' ? [resource] : resource, sensitivity: 'financial' as const };
    return { ...policy, description, inputSchema,
        execute: async (raw, context: AssistantUserContext) => {
            if (!context?.userId || !checkToolAuthorization(policy, context).allowed) {
                throw new Error('Akses finance ditolak.');
            }
            const db = tenantContext.getStore();
            const tenantId = tenantIdContext.getStore();
            if (!db || !tenantId || tenantId !== context.tenantId) {
                throw new Error('Konteks tenant aktif tidak cocok; muat ulang sesi.');
            }
            const input = inputSchema.parse(raw);
            try {
                return await db.$transaction(async tx => {
                    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
                    return execute(tx, input);
                }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 12_000, maxWait: 2_000 });
            } catch (error) {
                // Log classification only: Prisma messages/meta may contain SQL, PII or connection details.
                console.error('[finance-tool] read-only query failed', {
                    tool: name,
                    errorType:
                        error instanceof Prisma.PrismaClientKnownRequestError
                            ? error.code
                            : 'UNEXPECTED',
                });
                throw new Error('Pemeriksaan finance gagal; data belum dapat diverifikasi. Coba lagi atau hubungi administrator.');
            }
        },
    };
}

export const financeTools: AssistantToolDefinition[] = [
    financeTool('query_finance', 'Cari dan agregasikan baris Buku Besar read-only secara generik. Gunakan ledger_expenses untuk pertanyaan biaya/beban dan ledger_lines untuk pencarian jurnal umum. Pada ledger_expenses taruh subjek/kategori biaya sebagai keyword pertama. Semua keyword harus cocok tetapi boleh tersebar di akun, keterangan, nomor jurnal, referensi, atau detail. Jika tanggal tidak disebut gunakan CURRENT_MONTH dahulu; jangan minta akun/periode sebelum mencoba. Hasil POSTED dengan bukti transaksi; bukan raw SQL.',
        '/finance/reports/general-ledger', financeLedgerQuerySchema, async (tx, input) => financeLedgerQueryEvidence(await executeBusinessQuery(input, { db: tx }))),
    financeTool('get_purchase_invoice', 'Cek status purchase invoice/BILL, total dan dibayar, PO dan jumlah GR terkait melalui nomor/ID. Bukan invoice penjualan. Hasil ambigu perlu nomor persis.',
        '/finance/invoices/purchase', invoiceSearchSchema, async (tx, input) => purchaseInvoiceEvidence(await inspectPurchaseInvoice(tx, input.searchTerm, false), input.searchTerm)),
    financeTool('diagnose_purchase_invoice', 'Diagnosis read-only kenapa purchase invoice/BILL masih DRAFT: asal walk-in, review Finance, PO/GR, seluruh tagihan PO vs nilai diterima, pembayaran dan jurnal. Tidak melakukan approval/posting.',
        '/finance/invoices/purchase', invoiceSearchSchema, async (tx, input) => purchaseInvoiceEvidence(await inspectPurchaseInvoice(tx, input.searchTerm, true), input.searchTerm)),
    financeTool('diagnose_sales_return_credit', 'Diagnosis read-only kredit retur penjualan/tombol posting abu-abu melalui nomor/ID retur: status, penerimaan, invoice tujuan, usulan Finance existing, dan periode. postingDate opsional YYYY-MM-DD; jika tidak diisi memeriksa hari ini WIB.',
        ['/sales/returns', '/finance/returns'], invoiceSearchSchema.extend({ postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const d = new Date(value); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value; }, 'Tanggal tidak valid').optional() }),
        async (tx, input) => salesReturnCreditEvidence(await inspectSalesReturnCredit(tx, input.searchTerm, input.postingDate ? new Date(`${input.postingDate}T00:00:00+07:00`) : new Date()), input.searchTerm)),
    financeTool('get_invoice_status', 'Cek status invoice penjualan melalui nomor/id persis atau nama customer. Hasil ambigu memerlukan nomor persis.',
        '/finance/invoices/sales', invoiceSearchSchema, async (tx, input) => {
            const result = await findInvoices(tx, input.searchTerm);
            return { ...invoiceSelectionEvidence(result), searchMeta: documentSearchMeta(input.searchTerm, result.total, 'total') };
        }),
    financeTool('diagnose_invoice_payment', 'Diagnosis read-only invoice: pembayaran vs paidAmount, jurnal penjualan/pembayaran, nominal dan periode WIB. Jangan pilih diam-diam jika invoice ambigu.',
        '/finance/invoices/sales', invoiceSearchSchema, async (tx, input) => {
            const result = await diagnoseInvoice(tx, input.searchTerm);
            return { ...invoiceDiagnosisEvidence(result), searchMeta: documentSearchMeta(input.searchTerm, result.selection.total, 'total') };
        }),
    financeTool('get_finance_reconciliation', 'Rekonsiliasi laba-rugi/COGS read-only untuk tanggal WIB eksplisit (maksimal 366 hari): angka laporan existing, akun, jurnal sumber terbesar dan screening invoice. Hanya membuktikan konsistensi bookkeeping/kategori COGS, bukan kelengkapan ekonomi. Bukan ringkasan AR/AP atau perbaikan data.',
        '/finance/reports/income-statement', financeRangeSchema, async (tx, input) => reconciliationEvidence(await reconcileFinance(tx, input))),
    financeTool('diagnose_cogs_economic_completeness', 'Diagnosis deterministic read-only kelengkapan ekonomi COGS untuk tanggal WIB eksplisit (maksimal 366 hari): shipment/valuasi/jurnal, retur fisik-vs-komersial, dan jembatan agregat issue-WIP-output-shipment-return-adjustment. Gunakan untuk pertanyaan apakah HPP/COGS lengkap. Temuan adalah kondisi confirmed; implikasi accounting needs_review; jangan gabungkan basis nominal/movement/jurnal.',
        '/finance/reports/income-statement', financeRangeSchema, async (tx, input) => cogsEconomicDiagnosisEvidence(await diagnoseCogsEconomicCompleteness(tx, input))),
    financeTool('diagnose_inventory_economic_completeness', 'Diagnosis deterministic read-only Inventory GL vs economic stock flow untuk tanggal WIB eksplisit (maksimal 366 hari): exact mapped inventory accounts, movement valuation/journal coverage, receipt, shipment, issue/output WIP, return, adjustment, transfer, reversal, dan off-balance. Gunakan untuk pertanyaan selisih nilai inventory/persediaan. Quantity, persisted movement cost, posted GL, dan opening economic value adalah basis berbeda; kondisi confirmed dan implikasi accounting needs_review.',
        ['/finance/reports/general-ledger', '/warehouse/inventory/history'], financeRangeSchema, async (tx, input) => inventoryEconomicDiagnosisEvidence(await diagnoseInventoryEconomicCompleteness(tx, input))),
];
