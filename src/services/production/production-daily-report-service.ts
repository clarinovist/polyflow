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
import { executionScrapTotal } from '@/lib/production/execution-scrap';

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
    /**
     * Machine-level totals for the whole period, grouped per process.
     * Sorted: produced desc, then machine name (no-machine last).
     */
    machineTotals: Record<ProcessKey, MachineTotals[]>;
}

export interface MachineTotals {
    /** null = execution recorded without a machine */
    machineName: string | null;
    machineType: string | null;
    produced: number;
    scrap: number;
    entries: number;
}

export interface ProcessMachineDetail {
    totals: DailyProcessTotals;
    /** Sorted: produced desc, then machine name (no-machine last) */
    machines: MachineTotals[];
}

export interface DailyDetail {
    /** WIB business date, YYYY-MM-DD */
    date: string;
    byProcess: Record<ProcessKey, ProcessMachineDetail>;
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

/** Execution row shape this service consumes (after prisma select). */
interface ExecutionRow {
    quantityProduced: unknown;
    scrapQuantity: unknown;
    scrapProngkolQty: unknown;
    scrapDaunQty: unknown;
    productionOrder?: { bom?: { category?: string | null } | null } | null;
    machine?: { name: string; type: string } | null;
    pieceMachineType?: string | null;
}

/**
 * Grouping identity for machine totals. Normal rows always carry a machine
 * name (machineId → Machine). A type-only bucket covers the synthetic
 * "empty-machine" pattern (machineId NULL but machineType snapshot set, e.g.
 * kiosk piece-rate entries): grouping on the type keeps those rows attached to
 * the machine class that ran them instead of dissolving into "no machine".
 */
function machineKeyOf(exec: ExecutionRow): string {
    if (exec.machine?.name) return `name:${exec.machine.name}`;
    if (exec.pieceMachineType) return `type:${exec.pieceMachineType}`;
    return 'none';
}

interface MachineAgg {
    machineName: string | null;
    machineType: string | null;
    produced: number;
    scrap: number;
    entries: number;
}

/**
 * Fold executions into per-machine totals keyed by process.
 * Machines sorted by produced desc, then name (no-machine last) — same order
 * the UI renders them.
 */
function aggregateByMachine(
    executions: ExecutionRow[],
): Record<ProcessKey, MachineTotals[]> {
    const byProcessMachine = new Map<string, MachineAgg>();

    for (const exec of executions) {
        const key = processKeyFromCategory(exec.productionOrder?.bom?.category);
        const mKey = machineKeyOf(exec);
        const aggKey = `${key}:${mKey}`;
        let agg = byProcessMachine.get(aggKey);
        if (!agg) {
            agg = {
                machineName: exec.machine?.name ?? null,
                machineType:
                    exec.machine?.type ?? exec.pieceMachineType ?? null,
                produced: 0,
                scrap: 0,
                entries: 0,
            };
            byProcessMachine.set(aggKey, agg);
        }
        agg.produced += Number(exec.quantityProduced || 0);
        agg.scrap += executionScrapTotal(exec);
        agg.entries += 1;
    }

    const result = emptyByProcess() as unknown as Record<
        ProcessKey,
        MachineTotals[]
    >;
    for (const key of PROCESS_KEYS) result[key] = [];
    for (const [aggKey, agg] of byProcessMachine) {
        const key = aggKey.split(':')[0] as ProcessKey;
        result[key].push({ ...agg });
    }
    for (const key of PROCESS_KEYS) {
        result[key].sort(
            (a, b) =>
                b.produced - a.produced ||
                machineNameCompare(a.machineName, b.machineName),
        );
    }
    return result;
}

/** Alphabetical, but executions without a machine always sort last. */
function machineNameCompare(a: string | null, b: string | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
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
                scrapProngkolQty: true,
                scrapDaunQty: true,
                machine: { select: { name: true, type: true } },
                pieceMachineType: true,
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
            const scrapTotal = executionScrapTotal(exec);
            const bucket = row.byProcess[key];
            bucket.produced += Number(exec.quantityProduced || 0);
            bucket.scrap += scrapTotal;
            bucket.entries += 1;
            row.totalScrap += scrapTotal;
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

        return {
            from,
            to,
            rows,
            periodTotals,
            machineTotals: aggregateByMachine(executions),
        };
    }

    /**
     * One WIB business day broken down per process → per machine. Same source
     * and filter as the matching day row in getDailyReport (non-VOIDED,
     * startTime inside the WIB day bounds), so totals always agree.
     */
    static async getDailyDetail(params: {
        date: string;
    }): Promise<DailyDetail> {
        const date = parseBusinessDate(params.date);
        const { startOfDay, endOfDay } = getWibDayBounds(date);

        const executions = await prisma.productionExecution.findMany({
            where: {
                status: { not: 'VOIDED' },
                startTime: { gte: startOfDay, lte: endOfDay },
            },
            select: {
                quantityProduced: true,
                scrapQuantity: true,
                scrapProngkolQty: true,
                scrapDaunQty: true,
                machine: { select: { name: true, type: true } },
                pieceMachineType: true,
                productionOrder: {
                    select: { bom: { select: { category: true } } },
                },
            },
        });

        const byProcess = emptyByProcess() as unknown as Record<
            ProcessKey,
            ProcessMachineDetail
        >;
        for (const key of PROCESS_KEYS) {
            byProcess[key] = { totals: emptyProcessTotals(), machines: [] };
        }

        const machineAggs = aggregateByMachine(executions);
        for (const exec of executions) {
            const key = processKeyFromCategory(
                exec.productionOrder?.bom?.category,
            );
            byProcess[key].totals.produced += Number(
                exec.quantityProduced || 0,
            );
            byProcess[key].totals.scrap += executionScrapTotal(exec);
            byProcess[key].totals.entries += 1;
        }
        for (const key of PROCESS_KEYS) {
            byProcess[key].machines = machineAggs[key];
        }

        return { date, byProcess };
    }
}
