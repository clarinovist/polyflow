import { affalPercent } from './affal';
import { PROCESS_KEYS, type ProcessKey } from './process-keys';

/** One operator's totals within a single process (units follow that process). */
export interface OperatorProcessRow {
    process: ProcessKey;
    operatorName: string;
    operatorCode: string;
    totalQuantityProduced: number;
    totalScrapQuantity: number;
    ordersHandled: number;
    scrapRate: number;
}

export interface OperatorProcessEntry extends OperatorProcessRow {
    /** Affal ÷ (hasil + affal) of this process only; null when not computable. */
    affalPercent: number | null;
}

export interface OperatorProcessGroup {
    process: ProcessKey;
    operators: OperatorProcessEntry[];
}

/**
 * Compare operators inside each process only. Output units differ per
 * process, so nothing is summed or ranked across processes, and operators are
 * listed alphabetically rather than by output.
 */
export function groupOperatorsByProcess(
    rows: ReadonlyArray<OperatorProcessRow>,
): OperatorProcessGroup[] {
    return PROCESS_KEYS.flatMap((process) => {
        const operators = rows
            .filter((row) => row.process === process)
            .map((row) => ({
                ...row,
                affalPercent: affalPercent(
                    row.totalQuantityProduced,
                    row.totalScrapQuantity,
                ),
            }))
            .sort((a, b) =>
                a.operatorName.localeCompare(b.operatorName, 'id-ID'),
            );
        return operators.length > 0 ? [{ process, operators }] : [];
    });
}
