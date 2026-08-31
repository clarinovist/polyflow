#!/usr/bin/env npx tsx
/**
 * Backfill missing finance auto-journals (sales/purchase invoices & payments).
 *
 * Mendeteksi dokumen yang seharusnya punya JournalEntry tapi tidak pernah
 * kejurnal (auto-jurnal gagal diam-diam di call-site post-commit), lalu
 * membuatnya via AutoJournalService.ensureDocumentJournal — idempotent.
 *
 * Konteks: selisih rekap piutang vs neraca per 2026-08-31 — jurnal Juni/August yang
 * gagal dibuat diam-diam (plan lokal 2026-08-31, lihat docs/plan/ — gitignored).
 *
 * Run:
 *   npx tsx scripts/backfill-missing-finance-journals.ts --tenant=<subdomain>
 *   npx tsx scripts/backfill-missing-finance-journals.ts --tenant=<subdomain> --apply
 *   npx tsx scripts/backfill-missing-finance-journals.ts --tenant=<subdomain> --apply --mapping=/tmp/mapping.csv
 *
 * Mapping CSV (opsional, hasil review matching manual-vs-payment):
 *   type,id,decision
 *   SALES_PAYMENT,<paymentId>,skip        # sudah dibukukan lewat jurnal manual BKM
 *
 * Safety:
 * - DRY RUN default; --apply untuk benar-benar menulis.
 * - Jurnal perbaikan memakai tanggal HARI INI (periode fiskal berjalan harus
 *   OPEN) — tidak pernah backdate ke periode yang sudah CLOSED.
 * - Purchase invoice non-VAT sengaja TIDAK dibuatkan jurnal (by design handler
 *   hanya memposting leg PPN) — muncul sebagai statistik informasional saja.
 */

import { readFileSync } from 'fs';
import { JournalStatus, ReferenceType } from '@prisma/client';

import { actorContext } from '@/lib/core/actor-context';
import {
    getMainPrisma,
    getTenantDb,
    prisma,
    tenantContext,
    tenantIdContext,
    entitlementContext,
} from '@/lib/core/prisma';
import { toBusinessDateString } from '@/lib/utils/timezone';
import {
    PURCHASE_JOURNAL_CUTOFF_ISO,
} from '@/services/finance/journal-health-service';
import { AccountingService } from '@/services/accounting/accounting-service';
import { resolveAccount } from '@/services/accounting/account-resolver';
import { AutoJournalService } from '@/services/finance/auto-journal-service';
import {
    collectFinanceJournalIssues,
    type FinanceJournalIssues,
} from '@/services/finance/journal-health-service';

const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv
    .find((a) => a.startsWith('--tenant='))
    ?.split('=')[1];
const mappingPath = process.argv
    .find((a) => a.startsWith('--mapping='))
    ?.split('=')[1];
// Scope gate: 'ar' = sales side only, 'ap' = purchase side only, 'all' (default).
// Dipakai untuk eksekusi parsial (mis. Opsi A: AR dulu, hutang tidak disentuh).
const SCOPE = (process.argv
    .find((a) => a.startsWith('--scope='))
    ?.split('=')[1] || 'all') as 'all' | 'ar' | 'ap';
const SALES_IN_SCOPE = SCOPE !== 'ap';
const PURCHASE_IN_SCOPE = SCOPE !== 'ar';

const rupiah = (n: number) =>
    `Rp ${Math.round(n).toLocaleString('id-ID')}`;

function parseMappingSkipSet(path: string): Set<string> {
    const raw = readFileSync(path, 'utf-8');
    const skip = new Set<string>();
    for (const line of raw.split(/\r?\n/).slice(1)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const [type, id, decision] = trimmed.split(',').map((s) => s.trim());
        if (type && id && decision === 'skip') {
            skip.add(`${type}:${id}`);
        }
    }
    return skip;
}

async function ensureFiscalPeriodOpen(): Promise<void> {
    const [yearStr, monthStr] = toBusinessDateString(new Date()).split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    const period = await prisma.fiscalPeriod.findUnique({
        where: { year_month: { year, month } },
        select: { status: true },
    });

    if (!period) {
        console.log(
            `[period] FiscalPeriod ${year}-${month} belum ada — dibuat (OPEN).`,
        );
        await prisma.fiscalPeriod.create({ data: { year, month } });
        return;
    }
    if (period.status !== 'OPEN') {
        throw new Error(
            `FiscalPeriod ${year}-${month} status ${period.status} — tidak bisa memposting. Buka periode dulu.`,
        );
    }
    console.log(`[period] FiscalPeriod ${year}-${month} OPEN ✓`);
}

function summarize(issues: FinanceJournalIssues) {
    const missingSalesInvoiceTotal = issues.salesInvoicesMissing.reduce(
        (s, i) => s + i.totalAmount,
        0,
    );
    const shortfallTotal = issues.salesInvoiceShortfalls.reduce(
        (s, i) => s + i.difference,
        0,
    );
    const missingSalesPaymentTotal = issues.salesPaymentsMissing.reduce(
        (s, p) => s + p.amount,
        0,
    );
    const missingPurchaseInvoiceTotal = issues.purchaseInvoicesMissing.reduce(
        (s, i) => s + i.totalAmount,
        0,
    );
    const missingPurchasePaymentTotal = issues.purchasePaymentsMissing.reduce(
        (s, p) => s + p.amount,
        0,
    );

    console.log('=== Ringkasan temuan (tanpa jurnal POSTED/non-VOIDED) ===');
    console.log(`[scope=${SCOPE}] AR account: ${issues.arAccountCode ?? 'TIDAK KETEMU'} | AP account: ${issues.apAccountCode ?? 'TIDAK KETEMU'}`);
    console.log(
        `Sales invoice tanpa jurnal   : ${issues.salesInvoicesMissing.length} doc, ${rupiah(missingSalesInvoiceTotal)}`,
    );
    console.log(
        `Sales invoice jurnal kurang  : ${issues.salesInvoiceShortfalls.length} doc, total kekurangan ${rupiah(shortfallTotal)}`,
    );
    console.log(
        `Sales payment tanpa jurnal   : ${issues.salesPaymentsMissing.length} doc, ${rupiah(missingSalesPaymentTotal)}`,
    );
    console.log(
        `Purchase invoice tanpa jurnal (post-cutoff ${PURCHASE_JOURNAL_CUTOFF_ISO.slice(0, 10)}) : ${issues.purchaseInvoicesMissing.length} doc, ${rupiah(missingPurchaseInvoiceTotal)}`,
    );
    console.log(
        `Purchase payment tanpa jurnal (post-cutoff): ${issues.purchasePaymentsMissing.length} doc, ${rupiah(missingPurchasePaymentTotal)}`,
    );

    const expectedArDelta =
        missingSalesInvoiceTotal + shortfallTotal - missingSalesPaymentTotal;
    const expectedApDelta =
        missingPurchaseInvoiceTotal - missingPurchasePaymentTotal;
    console.log('---');
    console.log(
        `Estimasi delta AR bila semua dibackfill (invoice + shortfall − payment): ${rupiah(expectedArDelta)}`,
    );
    console.log(
        `Estimasi delta AP bila semua dibackfill (invoice − payment): ${rupiah(expectedApDelta)}`,
    );
    return {
        missingSalesInvoiceTotal,
        shortfallTotal,
        missingSalesPaymentTotal,
        missingPurchaseInvoiceTotal,
        missingPurchasePaymentTotal,
        expectedArDelta,
        expectedApDelta,
    };
}

async function runRepair(): Promise<void> {
    const issues = await collectFinanceJournalIssues(prisma);
    const stats = summarize(issues);

    if (!APPLY) {
        console.log('\nDRY RUN — tidak ada perubahan. Tambahkan --apply untuk menulis.');
        return;
    }

    const skipSet = mappingPath
        ? parseMappingSkipSet(mappingPath)
        : new Set<string>();
    const journalDate = new Date();
    const counts = { created: 0, exists: 0, promoted: 0, skipped: 0 };

    async function ensure(
        kind: Parameters<typeof AutoJournalService.ensureDocumentJournal>[0],
        id: string,
    ) {
        const outcome = await AutoJournalService.ensureDocumentJournal(
            kind,
            id,
            { journalDate },
        );
        counts[outcome.action] += 1;
        if (outcome.action === 'skipped') {
            console.warn(
                `[skip] ${kind} ${id}: ${outcome.reason ?? 'unknown'}`,
            );
        }
    }

    console.log('\n=== APPLY: sales invoice ===');
    for (const inv of issues.salesInvoicesMissing) {
        console.log(`[backfill] SALES_INVOICE ${inv.invoiceNumber} ${rupiah(inv.totalAmount)}`);
        await ensure('SALES_INVOICE', inv.id);
    }

    console.log('\n=== APPLY: sales invoice shortfall ===');
    const arAccount = await resolveAccount('accounts-receivable');
    const revenueAccount = await resolveAccount('sales-revenue');
    for (const s of issues.salesInvoiceShortfalls) {
        if (s.difference <= 0) {
            console.warn(
                `[skip-shortfall] ${s.invoiceNumber}: difference ${s.difference} ≤ 0 (over-debited) — review manual.`,
            );
            continue;
        }
        console.log(
            `[adjust] ${s.invoiceNumber}: Dr AR ${rupiah(s.difference)} / Cr Revenue`,
        );
        await AccountingService.createJournalEntry({
            entryDate: journalDate,
            description: `BACKFILL koreksi AR kurang untuk ${s.invoiceNumber} (docDate ${s.invoiceDate.toISOString().slice(0, 10)}) — jurnal awal tidak full amount`,
            reference: s.invoiceNumber,
            referenceType: ReferenceType.SALES_INVOICE,
            referenceId: s.id,
            isAutoGenerated: true,
            status: JournalStatus.POSTED,
            lines: [
                {
                    accountId: arAccount.id,
                    debit: s.difference,
                    credit: 0,
                    description: `AR shortfall ${s.invoiceNumber}`,
                },
                {
                    accountId: revenueAccount.id,
                    debit: 0,
                    credit: s.difference,
                    description: `Revenue shortfall ${s.invoiceNumber}`,
                },
            ],
        });
        counts.created += 1;
    }

    console.log('\n=== APPLY: sales payment ===');
    for (const p of issues.salesPaymentsMissing) {
        if (skipSet.has(`SALES_PAYMENT:${p.id}`)) {
            console.log(
                `[skip-mapping] payment ${p.paymentNumber ?? p.id} ${rupiah(p.amount)} — sudah terwakili jurnal manual.`,
            );
            counts.skipped += 1;
            continue;
        }
        console.log(`[backfill] SALES_PAYMENT ${p.paymentNumber ?? p.id} ${rupiah(p.amount)}`);
        await ensure('SALES_PAYMENT', p.id);
    }

    console.log('\n=== APPLY: purchase invoice (full AP, post-cutoff) ===');
    for (const inv of PURCHASE_IN_SCOPE
        ? issues.purchaseInvoicesMissing
        : []) {
        console.log(
            `[backfill] PURCHASE_INVOICE ${inv.invoiceNumber} ${rupiah(inv.totalAmount)}`,
        );
        await ensure('PURCHASE_INVOICE', inv.id);
    }
    if (!PURCHASE_IN_SCOPE && issues.purchaseInvoicesMissing.length > 0) {
        console.log(
            `[skip-scope] ${issues.purchaseInvoicesMissing.length} purchase invoice dilewati (scope=ar)`,
        );
    }

    console.log('\n=== APPLY: purchase payment ===');
    for (const p of PURCHASE_IN_SCOPE
        ? issues.purchasePaymentsMissing
        : []) {
        if (skipSet.has(`PURCHASE_PAYMENT:${p.id}`)) {
            console.log(
                `[skip-mapping] payment ${p.paymentNumber ?? p.id} ${rupiah(p.amount)} — sudah terwakili jurnal manual.`,
            );
            counts.skipped += 1;
            continue;
        }
        console.log(`[backfill] PURCHASE_PAYMENT ${p.paymentNumber ?? p.id} ${rupiah(p.amount)}`);
        await ensure('PURCHASE_PAYMENT', p.id);
    }
    if (!PURCHASE_IN_SCOPE && issues.purchasePaymentsMissing.length > 0) {
        console.log(
            `[skip-scope] ${issues.purchasePaymentsMissing.length} purchase payment dilewati (scope=ar)`,
        );
    }

    console.log('\n=== Selesai ===');
    console.log(
        `Jurnal: created=${counts.created}, promoted=${counts.promoted}, exists=${counts.exists}, skipped=${counts.skipped}`,
    );
    console.log(
        `Estimasi delta AR: ${rupiah(stats.expectedArDelta)} — verifikasi dengan bridge SQL di plan sebelum/ sesudah.`,
    );
}

async function main() {
    if (!tenantArg) {
        console.error('Usage: npx tsx scripts/backfill-missing-finance-journals.ts --tenant=<subdomain> [--apply] [--mapping=<csv>]');
        process.exitCode = 1;
        return;
    }

    const mainPrisma = getMainPrisma();
    const tenant = await mainPrisma.tenant.findUnique({
        where: { subdomain: tenantArg },
        select: { id: true, subdomain: true, dbUrl: true },
    });
    if (!tenant?.dbUrl) {
        console.error(`Tenant "${tenantArg}" tidak ditemukan / tanpa dbUrl.`);
        process.exitCode = 1;
        return;
    }

    console.log(
        `Tenant: ${tenant.subdomain} | mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`,
    );
    const tenantDb = getTenantDb(tenant.dbUrl);

    await tenantContext.run(tenantDb, () =>
        tenantIdContext.run(tenant.id, () =>
            entitlementContext.run([], () =>
                actorContext.run({ userId: 'system' }, async () => {
                    await ensureFiscalPeriodOpen();
                    await runRepair();
                }),
            ),
        ),
    );
}

main().catch((error) => {
    console.error('[backfill] FAILED:', error);
    process.exitCode = 1;
});
