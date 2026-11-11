import {
    CLOSURE_MAX_BATCH,
    CLOSURE_POLICY_LABELS,
    type ClosurePolicy,
} from '@/lib/hrd/stale-session-closure-constants';

/**
 * Tipe + konstanta koreksi massal sesi lupa pulang dipakai bersama dengan
 * server (file konstanta non-'use server'); di sini hanya teks UI tambahan.
 */
export { CLOSURE_MAX_BATCH };
export type {
    ClosureApplyResult,
    ClosurePolicy,
    ClosurePreview,
    ClosurePreviewRow,
} from '@/lib/hrd/stale-session-closure-constants';

export const DEFAULT_CLOSURE_POLICY: ClosurePolicy = 'SHIFT_END';

const POLICY_DESCRIPTIONS: Record<ClosurePolicy, string> = {
    SHIFT_END:
        'Jam pulang diisi sama dengan jam selesai shift pada tanggal kerja.',
    CLOCK_IN_PLUS_PLANNED:
        'Jam pulang diisi jam masuk ditambah jam kerja terjadwal, sehingga keterlambatan masuk tidak mengurangi upah.',
};

const POLICY_ORDER: readonly ClosurePolicy[] = [
    'SHIFT_END',
    'CLOCK_IN_PLUS_PLANNED',
];

export const POLICY_OPTIONS: ReadonlyArray<{
    value: ClosurePolicy;
    label: string;
    description: string;
}> = POLICY_ORDER.map((value) => ({
    value,
    label: CLOSURE_POLICY_LABELS[value],
    description: POLICY_DESCRIPTIONS[value],
}));

export function policyLabel(policy: ClosurePolicy): string {
    return CLOSURE_POLICY_LABELS[policy];
}
