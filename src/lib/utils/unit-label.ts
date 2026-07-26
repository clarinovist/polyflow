/**
 * Human-readable unit labels.
 * Prisma historically named the piece enum PACK while the DB value is PCS;
 * always prefer showing PCS for operators.
 */
export function formatUnitLabel(unit: string | null | undefined): string {
    if (!unit) return '';
    if (unit === 'PACK') return 'PCS';
    return unit;
}
