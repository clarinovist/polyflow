import { prisma } from '@/lib/core/prisma';
import { ValidationError } from '@/lib/errors/errors';
import {
    getWibDayBounds,
    getWibMonthBounds,
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
    /** WIB business dates, null = unbounded on that side (all-time mode). */
    from: string | null;
    to: string | null;
    /** Sorted descending by date (latest first) */
    rows: DailyProductionRow[];
    periodTotals: Record<ProcessKey, DailyProcessTotals>;
}

export interface MachineRecap {
    /** YYYY-MM when scoped to one month, null = all time. */
    month: string | null;
    /**
     * Machine-level totals, grouped per process.
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

/** Shared select — one shape for the period report, recap, and day detail. */
const EXECUTION_SELECT = {
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
};

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

/**
 * startTime filter for the optional period bounds. Null (both sides unset) =
 * all-time, no startTime constraint. Partial bounds (one side null) are
 * supported — the UI defaults only fill the missing side for display.
 */
function startBoundsWhere(
    from: string | null,
    to: string | null,
): { gte?: Date; lte?: Date } | null {
    if (!from && !to) return null;
    const where: { gte?: Date; lte?: Date } = {};
    if (from) where.gte = getWibDayBounds(from).startOfDay;
    if (to) where.lte = getWibDayBounds(to).endOfDay;
    return where;
}

/** 'YYYY-MM' → WIB month bounds; throws defensively on malformed input. */
function monthBoundsWhere(month: string): { gte: Date; lte: Date } {
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
    if (!match) {
        throw new ValidationError(
            `Invalid month format: "${month}". Expected YYYY-MM.`,
        );
    }
    const { start, end } = getWibMonthBounds(
        Number(match[1]),
        Number(match[2]),
    );
    return { gte: start, lte: end };
}

/** Every non-VOIDED execution inside the optional startTime bounds. */
async function fetchNonVoidedExecutions(
    startWhere: { gte?: Date; lte?: Date } | null,
) {
    return prisma.productionExecution.findMany({
        where: {
            status: { not: 'VOIDED' },
            ...(startWhere ? { startTime: startWhere } : {}),
        },
        select: EXECUTION_SELECT,
    });
}

export class ProductionDailyReportService {
    /**
     * Actual production output per WIB business day, bucketed by process
     * (from the SPK's BOM category). Counts only non-VOIDED executions whose
     * startTime falls inside the requested range — null bounds mean all time.
     * Defaults for the UI live in the page layer, not here.
     */
    static async getDailyReport(params?: {
        from?: string | null;
        to?: string | null;
    }): Promise<DailyProductionReport> {
        const from = params?.from ? parseBusinessDate(params.from) : null;
        const to = params?.to ? parseBusinessDate(params.to) : null;

        const executions = await fetchNonVoidedExecutions(
            startBoundsWhere(from, to),
        );

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

        return { from, to, rows, periodTotals };
    }

    /**
     * Machine-level recap for one WIB month (month = 'YYYY-MM') or all time
     * (month = null). Deliberately independent of getDailyReport's period so
     * the UI can filter the recap and the per-day table separately. Same
     * aggregation as the former report-level machineTotals.
     */
    static async getMachineRecap(params?: {
        month?: string | null;
    }): Promise<MachineRecap> {
        const month = params?.month ?? null;
        const startWhere = month ? monthBoundsWhere(month) : null;
        const executions = await fetchNonVoidedExecutions(startWhere);
        return { month, machineTotals: aggregateByMachine(executions) };
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

        const executions = await fetchNonVoidedExecutions({
            gte: startOfDay,
            lte: endOfDay,
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
