import { prisma } from '@/lib/core/prisma';
import {
    getWibDayBounds,
    parseBusinessDate,
    toBusinessDateString,
} from '@/lib/utils/timezone';
import {
    PROCESS_KEYS,
    processKeyFromCategory,
    type ProcessKey,
} from '@/lib/production/process-keys';

export interface DailyProcessTotals {
    produced: number;
    scrap: number;
    entries: number;
}

export interface DailyProductionRow {
    /** WIB business date, YYYY-MM-DD */
    date: string;
    byProcess: Record<ProcessKey, DailyProcessTotals>;
    totalScrap: number;
    totalEntries: number;
}

export interface DailyProductionReport {
    from: string;
    to: string;
    /** Sorted descending by date (latest first) */
    rows: DailyProductionRow[];
    periodTotals: Record<ProcessKey, DailyProcessTotals>;
}

function emptyProcessTotals(): DailyProcessTotals {
    return { produced: 0, scrap: 0, entries: 0 };
}

function emptyByProcess(): Record<ProcessKey, DailyProcessTotals> {
    return {
        MIXING: emptyProcessTotals(),
        EXTRUSION: emptyProcessTotals(),
        PACKING: emptyProcessTotals(),
        OTHER: emptyProcessTotals(),
    };
}

export class ProductionDailyReportService {
    /**
     * Actual production output per WIB business day, bucketed by process
     * (from the SPK's BOM category). Counts only non-VOIDED executions whose
     * startTime falls inside the requested WIB day range — the same source and
     * filter as the production live overview, so "kemarin" here always matches
     * the outputYesterday figure on /production.
     */
    static async getDailyReport(params?: {
        from?: string;
        to?: string;
    }): Promise<DailyProductionReport> {
        const from = parseBusinessDate(
            params?.from || toBusinessDateString(new Date()),
        );
        const to = parseBusinessDate(
            params?.to || toBusinessDateString(new Date()),
        );

        const { startOfDay } = getWibDayBounds(from);
        const { endOfDay } = getWibDayBounds(to);

        const executions = await prisma.productionExecution.findMany({
            where: {
                status: { not: 'VOIDED' },
                startTime: { gte: startOfDay, lte: endOfDay },
            },
            select: {
                startTime: true,
                quantityProduced: true,
                scrapQuantity: true,
                productionOrder: {
                    select: { bom: { select: { category: true } } },
                },
            },
        });

        const rowsByDate = new Map<string, DailyProductionRow>();

        for (const exec of executions) {
            const date = toBusinessDateString(exec.startTime);
            let row = rowsByDate.get(date);
            if (!row) {
                row = {
                    date,
                    byProcess: emptyByProcess(),
                    totalScrap: 0,
                    totalEntries: 0,
                };
                rowsByDate.set(date, row);
            }

            const key = processKeyFromCategory(
                exec.productionOrder?.bom?.category,
            );
            const bucket = row.byProcess[key];
            bucket.produced += Number(exec.quantityProduced || 0);
            bucket.scrap += Number(exec.scrapQuantity || 0);
            bucket.entries += 1;
            row.totalScrap += Number(exec.scrapQuantity || 0);
            row.totalEntries += 1;
        }

        const periodTotals = emptyByProcess();
        for (const key of PROCESS_KEYS) {
            for (const row of rowsByDate.values()) {
                periodTotals[key].produced += row.byProcess[key].produced;
                periodTotals[key].scrap += row.byProcess[key].scrap;
                periodTotals[key].entries += row.byProcess[key].entries;
            }
        }

        const rows = [...rowsByDate.values()].sort((a, b) =>
            b.date.localeCompare(a.date),
        );

        return { from, to, rows, periodTotals };
    }
}
