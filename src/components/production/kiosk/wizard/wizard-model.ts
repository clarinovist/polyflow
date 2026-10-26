import { kioskLabels } from '@/lib/labels';

export type WizardStepKey = 'hasil' | 'packaging' | 'affal' | 'qc' | 'kirim';

export const WIZARD_STEP_LABEL: Record<WizardStepKey, string> = {
    hasil: kioskLabels.wizardStepHasil,
    packaging: kioskLabels.wizardStepKemasan,
    affal: kioskLabels.wizardStepAffal,
    qc: kioskLabels.wizardStepQc,
    kirim: kioskLabels.wizardStepKirim,
};

/**
 * Hasil → (Kemasan) → Affal → (QC) → Kirim. Kemasan only for packaged output
 * with a good quantity: an affal-only entry posts no packaging.
 */
export function wizardSteps({
    actualPackagingEnabled,
    scrapOnly,
    hasQc,
}: {
    actualPackagingEnabled: boolean;
    scrapOnly: boolean;
    hasQc: boolean;
}): WizardStepKey[] {
    return [
        'hasil',
        ...(actualPackagingEnabled && !scrapOnly
            ? (['packaging'] as const)
            : []),
        'affal',
        ...(hasQc ? (['qc'] as const) : []),
        'kirim',
    ];
}

/** Operators type "24,7"; empty means zero; anything else is NaN. */
export function parseAmount(raw: string): number {
    const trimmed = raw.trim();
    if (trimmed === '') return 0;
    return Number(trimmed.replace(',', '.'));
}

const isAmount = (value: number) => Number.isFinite(value) && value >= 0;

export function hasilProblem({
    qty,
    scrapOnly,
    conversionInvalid,
}: {
    qty: number;
    scrapOnly: boolean;
    conversionInvalid: boolean;
}): string | null {
    if (!isAmount(qty)) return kioskLabels.wizardQtyInvalid;
    if (qty === 0 && !scrapOnly) return kioskLabels.wizardQtyMissing;
    if (qty > 0 && conversionInvalid) return kioskLabels.bomInvalidMessage;
    return null;
}

export function affalProblem({
    prongkol,
    daun,
    scrapOnly,
    noAffal,
}: {
    prongkol: number;
    daun: number;
    scrapOnly: boolean;
    noAffal: boolean;
}): string | null {
    if (!isAmount(prongkol) || !isAmount(daun))
        return kioskLabels.wizardScrapInvalid;
    const total = prongkol + daun;
    if (scrapOnly && total <= 0) return kioskLabels.wizardScrapRequired;
    if (!scrapOnly && total === 0 && !noAffal)
        return kioskLabels.wizardScrapMissing;
    return null;
}

export function qcProblem(
    params: ReadonlyArray<{ id: string }>,
    values: Record<string, string>,
): string | null {
    const missing = params.some((param) => {
        const raw = values[param.id] ?? '';
        return raw.trim() === '' || Number.isNaN(parseAmount(raw));
    });
    return missing ? kioskLabels.wizardQcMissing : null;
}

/**
 * A shift is required outside generic mode, and whenever no shift is active
 * now, so a stale shift is never attached by default.
 */
export function kirimProblem({
    mode,
    hasActiveShift,
    shiftId,
}: {
    mode: string;
    hasActiveShift: boolean;
    shiftId: string;
}): string | null {
    if ((mode !== 'GENERIC' || !hasActiveShift) && !shiftId)
        return kioskLabels.shiftWajibMessage;
    return null;
}
