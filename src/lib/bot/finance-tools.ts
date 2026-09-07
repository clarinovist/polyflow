import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { tenantContext, tenantIdContext } from '@/lib/core/prisma';
import { diagnoseInvoice, findInvoices } from '@/services/finance/invoice-diagnosis-service';
import { reconcileFinance } from '@/services/finance/finance-reconciliation-service';
import { financeRangeSchema, invoiceSearchSchema } from '@/services/finance/finance-diagnostic-input';
import type { AssistantToolDefinition, AssistantUserContext, ToolEvidence } from './assistant-types';
import { checkToolAuthorization } from './tool-authorization';
import { invoiceDiagnosisEvidence, invoiceSelectionEvidence, reconciliationEvidence } from './finance-evidence';

function financeTool<T extends z.ZodType>(
    name: string, description: string, resource: string, inputSchema: T,
    execute: (tx: Prisma.TransactionClient, input: z.output<T>) => Promise<ToolEvidence>,
): AssistantToolDefinition {
    const policy = { name, requiredResources: [resource], sensitivity: 'financial' as const };
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
                console.error('[finance-tool] read-only query failed', { tool: name, errorType: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : 'UNEXPECTED' });
                throw new Error('Pemeriksaan finance gagal; data belum dapat diverifikasi. Coba lagi atau hubungi administrator.');
            }
        },
    };
}

export const financeTools: AssistantToolDefinition[] = [
    financeTool('get_invoice_status', 'Cek status invoice penjualan melalui nomor/id persis atau nama customer. Hasil ambigu memerlukan nomor persis.',
        '/finance/invoices/sales', invoiceSearchSchema, async (tx, input) => invoiceSelectionEvidence(await findInvoices(tx, input.searchTerm))),
    financeTool('diagnose_invoice_payment', 'Diagnosis read-only invoice: pembayaran vs paidAmount, jurnal penjualan/pembayaran, nominal dan periode WIB. Jangan pilih diam-diam jika invoice ambigu.',
        '/finance/invoices/sales', invoiceSearchSchema, async (tx, input) => invoiceDiagnosisEvidence(await diagnoseInvoice(tx, input.searchTerm))),
    financeTool('get_finance_reconciliation', 'Rekonsiliasi laba-rugi/COGS read-only untuk tanggal WIB eksplisit (maksimal 366 hari): angka laporan existing, akun, jurnal sumber terbesar dan screening invoice. Bukan ringkasan AR/AP atau perbaikan data.',
        '/finance/reports/income-statement', financeRangeSchema, async (tx, input) => reconciliationEvidence(await reconcileFinance(tx, input))),
];
