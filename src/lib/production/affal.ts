import type { AffalLevel } from './alert-thresholds';

/**
 * Persentase affal terhadap output kotor: affal / (hasil bersih + affal).
 * Kedua nilai harus memakai satuan yang sama; pemanggil bertanggung jawab
 * untuk menolak data yang satuannya belum dapat dipastikan.
 */
export function affalPercent(
    produced: number,
    affal: number,
): number | null {
    const gross = produced + affal;
    if (gross <= 0) return null;
    return Math.round((affal / gross) * 1000) / 10;
}

/** Text color for an affal share; red is reserved for CRITICAL (above threshold). */
export function affalLevelClass(level: AffalLevel): string {
    switch (level) {
        case 'CRITICAL':
            return 'text-destructive font-medium';
        case 'WARNING':
            return 'text-amber-600 dark:text-amber-400 font-medium';
        case 'NONE':
            return 'text-muted-foreground';
        default:
            return 'text-foreground';
    }
}
