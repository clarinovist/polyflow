import type { PrismaClient } from '@prisma/client';
import type { DetectionResult } from '@/lib/telegram/digest/detection-types';
import type { ExecutiveStats } from '@/services/dashboard/executive-stats-service';
import { readNoteMemory } from './note-memory';
import { composeNotes } from './note-composer';
import { notifyPublishedNotes, publishNotes } from './note-publish';

export type CeoNotesRunOutcome = {
    created: string[];
    updated: string[];
    notificationsSent: number;
    usedFallback: boolean;
    skipped: boolean;
};

function summarizeStats(stats: ExecutiveStats): string {
    const r = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;
    return [
        `Penjualan MTD ${r(stats.sales.mtdRevenue)} (${stats.sales.activeOrders} SO aktif, ${stats.sales.pendingInvoices} invoice tertunda).`,
        `Pembelian MTD ${r(stats.purchasing.mtdSpending)} (${stats.purchasing.pendingPOs} PO tertunda).`,
        `Produksi: ${stats.production.activeJobs} SPK aktif, ${stats.production.delayedJobs} lewat jadwal, scrap ${Math.round(stats.production.totalScrapKg)} kg MTD, downtime ${stats.production.downtimeHours} jam.`,
        `Stok: ${stats.inventory.lowStockCount} item rendah. Kas: piutang overdue ${r(stats.cashflow.overdueReceivables)}, hutang overdue ${r(stats.cashflow.overduePayables)}, ${stats.cashflow.invoicesDueThisWeek} invoice jatuh tempo minggu ini.`,
    ].join('\n');
}

export async function runCeoNotesForTenant(
    tenantDb: PrismaClient,
    input: { results: DetectionResult[]; stats: ExecutiveStats },
): Promise<CeoNotesRunOutcome> {
    const empty: CeoNotesRunOutcome = {
        created: [],
        updated: [],
        notificationsSent: 0,
        usedFallback: false,
        skipped: false,
    };

    const okResults = input.results.filter((r) => r.status === 'ok');
    const allFingerprints = input.results.flatMap((r) =>
        r.items.map((i) => i.entityKey),
    );
    if (allFingerprints.length === 0) return { ...empty, skipped: true };

    const memory = await readNoteMemory(tenantDb, allFingerprints);
    const composed = await composeNotes({
        results: okResults,
        memory,
        statsSummary: summarizeStats(input.stats),
    });
    if (composed.notes.length === 0) {
        return { ...empty, usedFallback: composed.usedFallback, skipped: true };
    }

    const published = await publishNotes(tenantDb, composed.notes, {
        aiModel: composed.aiModel,
    });
    const notificationsSent = await notifyPublishedNotes(
        tenantDb,
        published.created,
    );

    return {
        created: published.created,
        updated: published.updated,
        notificationsSent,
        usedFallback: composed.usedFallback,
        skipped: false,
    };
}
