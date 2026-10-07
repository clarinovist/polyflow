import { Prisma, PrismaClient } from '@prisma/client';

// One-off guarded correction for the two October 2026 invoices documented in
// docs/plan/2026-10-07-correct-invoice-date.md. Default mode is dry-run.

const DAY_MS = 24 * 60 * 60 * 1000;
const ROMAN_MONTHS = [
    'I', 'II', 'III', 'IV', 'V', 'VI',
    'VII', 'VIII', 'IX', 'X', 'XI', 'XII',
] as const;

type CorrectionStatus = 'DRAFT' | 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERDUE';

export interface SalesInvoiceDateCorrectionInput {
    invoiceId: string;
    expectedInvoiceNumber: string;
    expectedSalesOrderNumber: string;
    expectedCurrentDate: string;
    newDate: string;
    expectedStatus: CorrectionStatus;
    expectedTotal: number;
    expectedPaid: number;
    renumber: boolean;
    execute: boolean;
    actorUserId?: string;
}

interface InvoiceRow {
    id: string;
    invoiceNumber: string;
    invoiceDate: Date;
    dueDate: Date | null;
    termOfPaymentDays: number;
    status: string;
    totalAmount: unknown;
    paidAmount: unknown;
    creditedAmount: unknown;
    priceAdjustmentAmount: unknown;
    updatedAt: Date;
    salesOrder: { orderNumber: string };
    payments: Array<{ id: string }>;
    priceAdjustments: Array<{ id: string }>;
    returnAllocations: Array<{ id: string }>;
    returnBasisLines: Array<{
        id: string;
        sourceItemId: string;
        productVariantId: string;
        quantity: unknown;
        netAmount: unknown;
        taxAmount: unknown;
        discountAmount: unknown;
        sourceJournalId: string;
        sourceEvidence: Prisma.JsonValue;
    }>;
}

interface JournalRow {
    id: string;
    entryNumber: string;
    entryDate: Date;
    status: string;
    reference: string | null;
    description: string;
    updatedAt: Date;
    lines: Array<{ debit: unknown; credit: unknown }>;
}

interface CorrectionTx {
    invoice: {
        findUnique(args: unknown): Promise<InvoiceRow | null>;
        findMany(args: unknown): Promise<Array<{ invoiceNumber: string }>>;
        updateMany(args: unknown): Promise<{ count: number }>;
    };
    journalEntry: {
        findMany(args: unknown): Promise<JournalRow[]>;
        updateMany(args: unknown): Promise<{ count: number }>;
    };
    fiscalPeriod: {
        findUnique(args: unknown): Promise<{ status: string } | null>;
    };
    auditLog: { create(args: unknown): Promise<unknown> };
    invoiceReturnBasisLine: {
        deleteMany(args: unknown): Promise<{ count: number }>;
        createMany(args: unknown): Promise<{ count: number }>;
    };
}

export interface CorrectionDb {
    $transaction<T>(
        callback: (tx: CorrectionTx) => Promise<T>,
        options?: { isolationLevel: Prisma.TransactionIsolationLevel; timeout: number },
    ): Promise<T>;
}

export interface SalesInvoiceDateCorrectionResult {
    mode: 'DRY_RUN' | 'EXECUTE';
    changed: boolean;
    invoiceId: string;
    oldInvoiceNumber: string;
    newInvoiceNumber: string;
    oldDate: string;
    newDate: string;
    oldDueDate: string | null;
    newDueDate: string;
    journalEntryNumber: string;
    paymentCount: number;
}

function parseBusinessDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('Tanggal harus berformat YYYY-MM-DD.');
    }
    const [year, month, day] = value.split('-').map(Number);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        throw new Error('Tanggal kalender tidak valid.');
    }
    return new Date(Date.UTC(year, month - 1, day) - 7 * 60 * 60 * 1000);
}

function businessDate(value: Date | null): string | null {
    if (!value) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(value);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;
    return [get('year'), get('month'), get('day')].join('-');
}

function amount(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error('Nominal dokumen tidak valid.');
    return parsed;
}

function sameAmount(left: unknown, right: number): boolean {
    return Math.abs(amount(left) - right) <= 0.005;
}

function invoiceSuffix(date: Date): string {
    const dateString = businessDate(date);
    if (!dateString) throw new Error('Tanggal target tidak valid.');
    const [year, month] = dateString.split('-').map(Number);
    return '/INV/' + ROMAN_MONTHS[month - 1] + '/' + year;
}

async function nextInvoiceNumber(tx: CorrectionTx, date: Date): Promise<string> {
    const suffix = invoiceSuffix(date);
    const rows = await tx.invoice.findMany({
        where: { invoiceNumber: { endsWith: suffix } },
        select: { invoiceNumber: true },
    });
    const max = rows.reduce((current, row) => {
        const sequence = Number.parseInt(row.invoiceNumber.split('/')[0], 10);
        return Number.isFinite(sequence) ? Math.max(current, sequence) : current;
    }, 0);
    return String(max + 1) + suffix;
}

function journalIsBalanced(journal: JournalRow): boolean {
    const debit = journal.lines.reduce((sum, line) => sum + amount(line.debit), 0);
    const credit = journal.lines.reduce((sum, line) => sum + amount(line.credit), 0);
    return journal.lines.length > 0 && Math.abs(debit - credit) <= 0.01;
}

export async function correctSalesInvoiceDate(
    db: CorrectionDb,
    input: SalesInvoiceDateCorrectionInput,
): Promise<SalesInvoiceDateCorrectionResult> {
    const targetDate = parseBusinessDate(input.newDate);
    const expectedCurrentDate = parseBusinessDate(input.expectedCurrentDate);

    return db.$transaction(async (tx) => {
        const invoice = await tx.invoice.findUnique({
            where: { id: input.invoiceId },
            include: {
                salesOrder: { select: { orderNumber: true } },
                payments: { select: { id: true } },
                priceAdjustments: { select: { id: true } },
                returnAllocations: { select: { id: true } },
                returnBasisLines: {
                    select: {
                        id: true, sourceItemId: true, productVariantId: true,
                        quantity: true, netAmount: true, taxAmount: true,
                        discountAmount: true, sourceJournalId: true,
                        sourceEvidence: true,
                    },
                },
            },
        });
        if (!invoice) throw new Error('Invoice target tidak ditemukan.');

        const journals = await tx.journalEntry.findMany({
            where: {
                referenceType: 'SALES_INVOICE', referenceId: invoice.id,
                status: { not: 'VOIDED' },
            },
            include: { lines: { select: { debit: true, credit: true } } },
        });
        if (journals.length !== 1) {
            throw new Error('Invoice harus memiliki tepat satu jurnal penjualan aktif.');
        }
        const journal = journals[0];
        if (!journalIsBalanced(journal)) throw new Error('Jurnal penjualan tidak seimbang.');
        if (invoice.salesOrder.orderNumber !== input.expectedSalesOrderNumber) {
            throw new Error('Sales Order target tidak cocok.');
        }
        if (invoice.status !== input.expectedStatus) throw new Error('Status invoice berubah.');
        if (!sameAmount(invoice.totalAmount, input.expectedTotal)) {
            throw new Error('Total invoice berubah.');
        }
        if (!sameAmount(invoice.paidAmount, input.expectedPaid)) {
            throw new Error('Nilai pembayaran invoice berubah.');
        }
        if (amount(invoice.creditedAmount) !== 0 || amount(invoice.priceAdjustmentAmount) !== 0) {
            throw new Error('Invoice memiliki kredit atau penyesuaian harga.');
        }
        if (invoice.priceAdjustments.length || invoice.returnAllocations.length) {
            throw new Error('Invoice memiliki transaksi koreksi turunan.');
        }

        const targetDueDate = new Date(
            targetDate.getTime() + invoice.termOfPaymentDays * DAY_MS,
        );
        const targetSuffix = invoiceSuffix(targetDate);
        const numberAlreadyMatches = invoice.invoiceNumber.endsWith(targetSuffix);
        const alreadyCorrect =
            businessDate(invoice.invoiceDate) === input.newDate &&
            businessDate(invoice.dueDate) === businessDate(targetDueDate) &&
            businessDate(journal.entryDate) === input.newDate &&
            numberAlreadyMatches;
        if (alreadyCorrect) {
            return {
                mode: input.execute ? 'EXECUTE' : 'DRY_RUN', changed: false,
                invoiceId: invoice.id,
                oldInvoiceNumber: invoice.invoiceNumber,
                newInvoiceNumber: invoice.invoiceNumber,
                oldDate: businessDate(invoice.invoiceDate)!, newDate: input.newDate,
                oldDueDate: businessDate(invoice.dueDate),
                newDueDate: businessDate(targetDueDate)!,
                journalEntryNumber: journal.entryNumber,
                paymentCount: invoice.payments.length,
            };
        }

        if (invoice.invoiceNumber !== input.expectedInvoiceNumber) {
            throw new Error('Nomor invoice target berubah.');
        }
        if (businessDate(invoice.invoiceDate) !== businessDate(expectedCurrentDate)) {
            throw new Error('Tanggal awal invoice berubah.');
        }
        if (!numberAlreadyMatches && !input.renumber) {
            throw new Error('Bulan nomor invoice tidak cocok; gunakan --renumber.');
        }
        const targetPeriod = await tx.fiscalPeriod.findUnique({
            where: {
                year_month: {
                    year: Number(input.newDate.slice(0, 4)),
                    month: Number(input.newDate.slice(5, 7)),
                },
            },
            select: { status: true },
        });
        if (targetPeriod?.status !== 'OPEN') throw new Error('Periode target tidak OPEN.');

        const newInvoiceNumber = numberAlreadyMatches
            ? invoice.invoiceNumber
            : await nextInvoiceNumber(tx, targetDate);
        const result: SalesInvoiceDateCorrectionResult = {
            mode: input.execute ? 'EXECUTE' : 'DRY_RUN', changed: input.execute,
            invoiceId: invoice.id,
            oldInvoiceNumber: invoice.invoiceNumber, newInvoiceNumber,
            oldDate: businessDate(invoice.invoiceDate)!, newDate: input.newDate,
            oldDueDate: businessDate(invoice.dueDate),
            newDueDate: businessDate(targetDueDate)!,
            journalEntryNumber: journal.entryNumber,
            paymentCount: invoice.payments.length,
        };
        if (!input.execute) return result;

        // Recognition evidence is immutable by trigger. The date correction does
        // not alter amounts/lines; temporarily remove only unused basis rows and
        // restore the exact persisted rows in this same transaction.
        const removedBasis = await tx.invoiceReturnBasisLine.deleteMany({
            where: { invoiceId: invoice.id },
        });
        if (removedBasis.count !== invoice.returnBasisLines.length) {
            throw new Error('Basis invoice berubah bersamaan; koreksi dibatalkan.');
        }

        const invoiceUpdate = await tx.invoice.updateMany({
            where: { id: invoice.id, updatedAt: invoice.updatedAt },
            data: { invoiceDate: targetDate, dueDate: targetDueDate, invoiceNumber: newInvoiceNumber },
        });
        if (invoiceUpdate.count !== 1) {
            throw new Error('Invoice berubah bersamaan; koreksi dibatalkan.');
        }
        const journalUpdate = await tx.journalEntry.updateMany({
            where: { id: journal.id, updatedAt: journal.updatedAt },
            data: {
                entryDate: targetDate, reference: newInvoiceNumber,
                description: 'Sales Invoice #' + newInvoiceNumber,
            },
        });
        if (journalUpdate.count !== 1) {
            throw new Error('Jurnal berubah bersamaan; koreksi dibatalkan.');
        }

        const restoredBasis = await tx.invoiceReturnBasisLine.createMany({
            data: invoice.returnBasisLines.map((line) => ({
                ...line,
                invoiceId: invoice.id,
            })),
        });
        if (restoredBasis.count !== invoice.returnBasisLines.length) {
            throw new Error('Basis invoice tidak berhasil dipulihkan; koreksi dibatalkan.');
        }

        await tx.auditLog.create({
            data: {
                userId: input.actorUserId ?? 'system',
                action: 'CORRECT_SALES_INVOICE_DATE', entityType: 'Invoice', entityId: invoice.id,
                details: 'Invoice ' + invoice.invoiceNumber + ' corrected from ' + result.oldDate +
                    ' to ' + result.newDate + '; number ' + newInvoiceNumber + '; due ' +
                    result.newDueDate + '; journal ' + journal.entryNumber + ' synchronized.',
                changes: JSON.stringify({
                    invoiceDate: { from: result.oldDate, to: result.newDate },
                    dueDate: { from: result.oldDueDate, to: result.newDueDate },
                    invoiceNumber: { from: result.oldInvoiceNumber, to: result.newInvoiceNumber },
                    journalEntryDate: { from: businessDate(journal.entryDate), to: result.newDate },
                }),
            },
        });
        return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15_000 });
}

type CliOptions = SalesInvoiceDateCorrectionInput & { tenant: string };

function valueArg(args: string[], name: string): string | undefined {
    return args.find((arg) => arg.startsWith('--' + name + '='))?.slice(name.length + 3);
}

function parseCli(args: string[]): CliOptions {
    const required = (name: string) => {
        const value = valueArg(args, name);
        if (!value) throw new Error('Argumen --' + name + '=... wajib.');
        return value;
    };
    const execute = args.includes('--execute');
    if (execute && !args.includes('--yes')) throw new Error('--execute wajib disertai --yes.');
    return {
        tenant: required('tenant'), invoiceId: required('invoice-id'),
        expectedInvoiceNumber: required('expected-invoice-number'),
        expectedSalesOrderNumber: required('expected-sales-order'),
        expectedCurrentDate: required('expected-current-date'), newDate: required('new-date'),
        expectedStatus: required('expected-status') as CorrectionStatus,
        expectedTotal: Number(required('expected-total')),
        expectedPaid: Number(required('expected-paid')), renumber: args.includes('--renumber'),
        execute, actorUserId: valueArg(args, 'actor-id') ?? 'system',
    };
}

export async function runCli(args: string[], log: Pick<Console, 'log'> = console) {
    const options = parseCli(args);
    const registry = new PrismaClient();
    let tenantDb: PrismaClient | undefined;
    try {
        const tenant = await registry.tenant.findFirst({
            where: { subdomain: options.tenant, status: 'ACTIVE' }, select: { dbUrl: true },
        });
        if (!tenant?.dbUrl) throw new Error('Tenant aktif tidak ditemukan.');
        tenantDb = new PrismaClient({ datasources: { db: { url: tenant.dbUrl } } });
        const result = await correctSalesInvoiceDate(
            tenantDb as unknown as CorrectionDb, options,
        );
        log.log(JSON.stringify(result));
        return result;
    } finally {
        await tenantDb?.$disconnect();
        await registry.$disconnect();
    }
}

if (require.main === module) {
    void runCli(process.argv.slice(2)).catch((error) => {
        console.error(error instanceof Error ? error.message : 'Koreksi invoice gagal.');
        process.exitCode = 1;
    });
}
