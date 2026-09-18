import { Prisma } from '@prisma/client';
import { getIncomeStatement } from '@/services/accounting/reports-service';
import { nonClosingReferenceSql } from '@/services/accounting/closing-reference-filter';
import { financeRange } from './finance-diagnostic-input';

const SAMPLE_LIMIT = 20;
type CogsSource = {
    id: string; entryNumber: string; entryDate: Date; reference: string | null;
    referenceType: string | null; referenceId: string | null; net: Prisma.Decimal;
    totalCount: bigint; totalNet: Prisma.Decimal;
};
type InvoiceSource = {
    id: string; invoiceNumber: string; invoiceDate: Date; status: string; customer: string | null;
    totalAmount: Prisma.Decimal; paidAmount: Prisma.Decimal; creditedAmount: Prisma.Decimal; allocatedCredit: Prisma.Decimal; paymentTotal: Prisma.Decimal;
    activeJournals: bigint; postedJournals: bigint; draftJournals: bigint;
    totalCount: bigint; totalValue: Prisma.Decimal;
};

async function cogsSources(tx: Prisma.TransactionClient, start: Date, end: Date) {
    // Same type, category, status, reference and date semantics as getIncomeStatement.
    // Window aggregates run BEFORE LIMIT, including negative/reversal contributions.
    return tx.$queryRaw<CogsSource[]>(Prisma.sql`
        WITH source AS (
            SELECT j.id, j."entryNumber", j."entryDate", j.reference, j."referenceType", j."referenceId",
                SUM(CASE WHEN a.type = 'REVENUE' THEN l.credit-l.debit ELSE l.debit-l.credit END) AS net
            FROM "JournalEntry" j JOIN "JournalLine" l ON l."journalEntryId" = j.id
            JOIN "Account" a ON a.id = l."accountId"
            WHERE j.status = 'POSTED' AND ${nonClosingReferenceSql(Prisma.sql`j.reference`)}
                AND j."entryDate" >= ${start} AND j."entryDate" <= ${end}
                AND a.category = 'COGS' AND a.type IN ('REVENUE', 'EXPENSE')
            GROUP BY j.id
        )
        SELECT *, COUNT(*) OVER () AS "totalCount", SUM(net) OVER () AS "totalNet"
        FROM source ORDER BY ABS(net) DESC, id ASC LIMIT ${SAMPLE_LIMIT}
    `);
}

async function invoiceSources(tx: Prisma.TransactionClient, start: Date, end: Date) {
    // Invoice-date cohort, NOT journal-date revenue. This value must never be added to profit.
    return tx.$queryRaw<InvoiceSource[]>(Prisma.sql`
        WITH source AS (
            SELECT i.id, i."invoiceNumber", i."invoiceDate", i.status, i."totalAmount", i."paidAmount", i."creditedAmount", COALESCE(rc.total, 0) AS "allocatedCredit", c.name AS customer,
                COALESCE(p.total, 0) AS "paymentTotal", j.active AS "activeJournals", j.posted AS "postedJournals", j.draft AS "draftJournals"
            FROM "Invoice" i JOIN "SalesOrder" so ON so.id = i."salesOrderId"
            LEFT JOIN "Customer" c ON c.id = so."customerId"
            LEFT JOIN LATERAL (SELECT SUM(amount) total FROM "Payment" WHERE "invoiceId" = i.id) p ON TRUE
            LEFT JOIN LATERAL (
                SELECT SUM(a."totalAmount") total FROM "SalesReturnCreditAllocation" a
                JOIN "SalesReturnCredit" c ON c.id = a."creditId"
                WHERE a."invoiceId" = i.id AND c.status = 'POSTED'
            ) rc ON TRUE
            CROSS JOIN LATERAL (
                SELECT COUNT(*) FILTER (WHERE status <> 'VOIDED') active,
                    COUNT(*) FILTER (WHERE status = 'POSTED') posted,
                    COUNT(*) FILTER (WHERE status = 'DRAFT') draft
                FROM "JournalEntry" WHERE "referenceType" = 'SALES_INVOICE' AND "referenceId" = i.id
            ) j
            WHERE i."invoiceDate" >= ${start} AND i."invoiceDate" <= ${end}
        ), anomalies AS (
            SELECT * FROM source WHERE
                (status IN ('UNPAID','PARTIAL','PAID','OVERDUE') AND ("activeJournals" <> 1 OR "postedJournals" <> 1))
                OR (status IN ('DRAFT','CANCELLED') AND "postedJournals" > 0)
                OR "paymentTotal" <> "paidAmount" OR "paymentTotal" + "creditedAmount" > "totalAmount"
                OR "creditedAmount" <> "allocatedCredit"
        )
        SELECT *, COUNT(*) OVER () AS "totalCount", SUM("totalAmount") OVER () AS "totalValue"
        FROM anomalies ORDER BY ABS("totalAmount") DESC, id ASC LIMIT ${SAMPLE_LIMIT}
    `);
}

export async function reconcileFinance(tx: Prisma.TransactionClient, input: unknown) {
    const range = financeRange(input);
    const report = await getIncomeStatement(range.start, range.end, tx);
    const cogsRows = await cogsSources(tx, range.start, range.end);
    const invoiceRows = await invoiceSources(tx, range.start, range.end);
    const cogsCount = Number(cogsRows[0]?.totalCount ?? 0);
    const invoiceCount = Number(invoiceRows[0]?.totalCount ?? 0);
    const cogsTotal = Number(cogsRows[0]?.totalNet ?? 0);
    return {
        range, report,
        cogs: { rows: cogsRows, count: cogsCount, total: cogsTotal, truncated: cogsCount > cogsRows.length },
        invoices: { rows: invoiceRows, count: invoiceCount, total: Number(invoiceRows[0]?.totalValue ?? 0), truncated: invoiceCount > invoiceRows.length },
        cogsDifference: report.totalCOGS - cogsTotal,
    };
}
