import { z } from 'zod';
import { OWNER_HPP_LIMITS } from './workspace-schema';

export const VOICE_LIMITS = {
    maxCommands: 20,
    maxTranscriptLength: 1000,
    maxHeardLength: 120,
    maxAudioBytes: 1_500_000,
    minHoldMs: 300,
    maxRecordMs: 30_000,
    requestTimeoutMs: 20_000,
} as const;

const SCRAP_PERCENT_FIELD = 'scrapPercent';

/** Models often send null for "not said"; treat it as absent. */
function optionalOf<T extends z.ZodType>(schema: T) {
    return schema
        .nullish()
        .transform((value): z.output<T> | undefined => value ?? undefined);
}

const nameSchema = z.string().trim().min(1).max(OWNER_HPP_LIMITS.maxTextLength);
const unitSchema = z.string().trim().min(1).max(OWNER_HPP_LIMITS.maxUnitLength);
const nonNegative = z.number().min(0).max(OWNER_HPP_LIMITS.maxNumber);
const positive = z.number().positive().max(OWNER_HPP_LIMITS.maxNumber);
const scrapSchema = z.number().min(0).max(OWNER_HPP_LIMITS.maxScrapPercent);
const percentageSchema = z
    .number()
    .min(0)
    .max(OWNER_HPP_LIMITS.maxOverheadPercent);

const heardSchema = z
    .string()
    .nullish()
    .transform((value) =>
        (value ?? '').trim().slice(0, VOICE_LIMITS.maxHeardLength),
    );

const base = {
    heard: heardSchema,
    stage: optionalOf(nameSchema),
};

export const COST_FORMULAS = [
    'fixed-per-output',
    'quantity-times-unit-cost',
    'batch-cost-per-good-output',
    'percentage-of-pre-overhead',
] as const;
export type CostFormula = (typeof COST_FORMULAS)[number];

/** Numeric fields a formula needs; all must be said for add_cost. */
export const COST_REQUIRED_FIELDS: Record<CostFormula, readonly string[]> = {
    'fixed-per-output': ['value'],
    'quantity-times-unit-cost': ['quantity', 'unitCost'],
    'batch-cost-per-good-output': [
        'batchQuantity',
        'costPerBatchUnit',
        'goodOutputQuantity',
    ],
    'percentage-of-pre-overhead': ['percentage'],
};

/** Every field a formula may carry (required numbers plus unit labels). */
export const COST_FIELDS_BY_FORMULA: Record<CostFormula, readonly string[]> = {
    'fixed-per-output': ['value'],
    'quantity-times-unit-cost': ['quantity', 'unitCost', 'unit'],
    'batch-cost-per-good-output': [
        'batchQuantity',
        'costPerBatchUnit',
        'goodOutputQuantity',
        'batchUnit',
    ],
    'percentage-of-pre-overhead': ['percentage'],
};

const costFields = {
    value: optionalOf(nonNegative),
    quantity: optionalOf(nonNegative),
    unitCost: optionalOf(nonNegative),
    batchQuantity: optionalOf(nonNegative),
    costPerBatchUnit: optionalOf(nonNegative),
    goodOutputQuantity: optionalOf(positive),
    percentage: optionalOf(percentageSchema),
    unit: optionalOf(unitSchema),
    batchUnit: optionalOf(unitSchema),
};

const ALL_COST_FIELD_KEYS = Object.keys(costFields);

const setOutputSchema = z.object({
    ...base,
    op: z.literal('set_output'),
    qty: positive,
    unit: optionalOf(unitSchema),
});

const addMaterialSchema = z.object({
    ...base,
    op: z.literal('add_material'),
    name: nameSchema,
    unit: unitSchema,
    qty: nonNegative,
    price: nonNegative,
    scrapPercent: optionalOf(scrapSchema),
});

const updateMaterialSchema = z
    .object({
        ...base,
        op: z.literal('update_material'),
        name: nameSchema,
        qty: optionalOf(nonNegative),
        price: optionalOf(nonNegative),
        scrapPercent: optionalOf(scrapSchema),
    })
    .refine(
        (command) =>
            command.qty !== undefined ||
            command.price !== undefined ||
            command.scrapPercent !== undefined,
        { message: 'update_material tanpa nilai yang diubah.' },
    );

const removeMaterialSchema = z.object({
    ...base,
    op: z.literal('remove_material'),
    name: nameSchema,
});

const addCostSchema = z
    .object({
        ...base,
        op: z.literal('add_cost'),
        label: nameSchema,
        category: z
            .enum(['material', 'conversion'])
            .nullish()
            .transform((value) => value ?? ('conversion' as const)),
        formula: z.enum(COST_FORMULAS),
        ...costFields,
    })
    .superRefine((command, ctx) => {
        const record = command as Record<string, unknown>;
        for (const field of COST_REQUIRED_FIELDS[command.formula]) {
            if (record[field] === undefined) {
                ctx.addIssue({
                    code: 'custom',
                    message: `add_cost: kolom ${field} wajib untuk ${command.formula}.`,
                });
            }
        }
    });

const updateCostSchema = z
    .object({
        ...base,
        op: z.literal('update_cost'),
        label: nameSchema,
        ...costFields,
    })
    .refine(
        (command) =>
            ALL_COST_FIELD_KEYS.some(
                (key) =>
                    (command as Record<string, unknown>)[key] !== undefined,
            ),
        { message: 'update_cost tanpa nilai yang diubah.' },
    );

const removeCostSchema = z.object({
    ...base,
    op: z.literal('remove_cost'),
    label: nameSchema,
});

const setSellPriceSchema = z.object({
    ...base,
    op: z.literal('set_sell_price'),
    price: positive,
});

const addStageSchema = z.object({
    ...base,
    op: z.literal('add_stage'),
    name: nameSchema,
    outputUnit: optionalOf(unitSchema),
    outputQty: optionalOf(positive),
});

const selectStageSchema = z.object({
    heard: heardSchema,
    op: z.literal('select_stage'),
    stage: nameSchema,
});

export const voiceCommandSchema = z.discriminatedUnion('op', [
    setOutputSchema,
    addMaterialSchema,
    updateMaterialSchema,
    removeMaterialSchema,
    addCostSchema,
    updateCostSchema,
    removeCostSchema,
    setSellPriceSchema,
    addStageSchema,
    selectStageSchema,
]);

export const voiceCommandsResponseSchema = z.object({
    commands: z.array(voiceCommandSchema).max(VOICE_LIMITS.maxCommands),
});

export type VoiceCommand = z.output<typeof voiceCommandSchema>;
export type VoiceOp = VoiceCommand['op'];

export interface CommandNumber {
    field: string;
    value: number;
}

/**
 * Every numeric field a command carries. The cross-check compares these with
 * the numbers actually spoken. `scrapPercent: 0` is the schema default, not
 * something the owner has to say.
 */
export function commandNumbers(command: VoiceCommand): CommandNumber[] {
    return Object.entries(command)
        .filter(
            (entry): entry is [string, number] =>
                typeof entry[1] === 'number' &&
                !(entry[0] === SCRAP_PERCENT_FIELD && entry[1] === 0),
        )
        .map(([field, value]) => ({ field, value }));
}
