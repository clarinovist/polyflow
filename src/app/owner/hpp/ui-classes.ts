export const SELECT_CLASS =
    'border-input dark:bg-input/30 h-9 w-full min-w-0 rounded-md border bg-transparent px-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

/** Colours for the per-stage cost bar; they identify stages, not status. */
export const STAGE_BAR_COLORS = [
    'bg-primary',
    'bg-amber-500',
    'bg-sky-500',
    'bg-emerald-500',
    'bg-rose-500',
    'bg-violet-500',
] as const;

export const COST_FORMULA_LABELS = {
    'fixed-per-output': 'Biaya tetap per keluaran',
    'quantity-times-unit-cost': 'Jumlah × harga satuan',
    'batch-cost-per-good-output': 'Biaya batch ÷ hasil baik',
    'percentage-of-pre-overhead': '% dari subtotal sebelum overhead',
} as const;
