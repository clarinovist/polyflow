import { z } from 'zod';
import { orderStages } from './stage-graph';

export const OWNER_HPP_LIMITS = {
    maxScenarios: 10,
    maxStages: 12,
    maxMaterials: 40,
    maxCosts: 20,
    maxTextLength: 80,
    maxUnitLength: 16,
    maxNumber: 1_000_000_000_000,
    maxScrapPercent: 500,
    maxOverheadPercent: 1000,
    maxDocumentBytes: 200_000,
} as const;

export const OWNER_HPP_WORKSPACE_VERSION = 2;

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'ID tidak valid.');
const textSchema = z
    .string()
    .trim()
    .min(1, 'Teks tidak boleh kosong.')
    .max(OWNER_HPP_LIMITS.maxTextLength);
const unitSchema = z.string().trim().min(1).max(OWNER_HPP_LIMITS.maxUnitLength);
const nonNegative = z.number().min(0).max(OWNER_HPP_LIMITS.maxNumber);
const positive = z
    .number()
    .positive('Harus lebih besar dari nol.')
    .max(OWNER_HPP_LIMITS.maxNumber);
const categorySchema = z.enum(['material', 'conversion']);

const rawMaterialSchema = z.object({
    id: idSchema,
    kind: z.literal('raw'),
    name: textSchema,
    unit: unitSchema,
    qty: nonNegative,
    scrapPercent: z.number().min(0).max(OWNER_HPP_LIMITS.maxScrapPercent),
    price: nonNegative,
    erpPrice: nonNegative.nullable(),
    erpAt: z.string().max(40).nullable().optional(),
});

const stageMaterialSchema = z.object({
    id: idSchema,
    kind: z.literal('stage'),
    from: idSchema,
    qty: nonNegative,
    scrapPercent: z.number().min(0).max(OWNER_HPP_LIMITS.maxScrapPercent),
});

const materialSchema = z.discriminatedUnion('kind', [
    rawMaterialSchema,
    stageMaterialSchema,
]);

const costSchema = z.discriminatedUnion('formula', [
    z.object({
        id: idSchema,
        label: textSchema,
        formula: z.literal('fixed-per-output'),
        category: categorySchema,
        value: nonNegative,
    }),
    z.object({
        id: idSchema,
        label: textSchema,
        formula: z.literal('quantity-times-unit-cost'),
        category: categorySchema,
        quantity: nonNegative,
        unitCost: nonNegative,
        unit: unitSchema,
    }),
    z.object({
        id: idSchema,
        label: textSchema,
        formula: z.literal('batch-cost-per-good-output'),
        category: categorySchema,
        batchQuantity: nonNegative,
        costPerBatchUnit: nonNegative,
        goodOutputQuantity: positive,
        batchUnit: unitSchema,
    }),
    z.object({
        id: idSchema,
        label: textSchema,
        formula: z.literal('percentage-of-pre-overhead'),
        percentage: z.number().min(0).max(OWNER_HPP_LIMITS.maxOverheadPercent),
    }),
]);

const stageSchema = z.object({
    id: idSchema,
    name: textSchema,
    outputUnit: unitSchema,
    outputQty: positive,
    materials: z.array(materialSchema).max(OWNER_HPP_LIMITS.maxMaterials),
    costs: z.array(costSchema).max(OWNER_HPP_LIMITS.maxCosts),
});

function hasDuplicates(values: readonly string[]): boolean {
    return new Set(values).size !== values.length;
}

const scenarioSchema = z
    .object({
        id: idSchema,
        name: textSchema,
        finalStageId: idSchema,
        sellPrice: positive.nullable(),
        stages: z.array(stageSchema).min(1).max(OWNER_HPP_LIMITS.maxStages),
    })
    .superRefine((scenario, ctx) => {
        if (hasDuplicates(scenario.stages.map((stage) => stage.id))) {
            ctx.addIssue({ code: 'custom', message: 'ID tahap kembar.' });
            return;
        }
        if (
            !scenario.stages.some((stage) => stage.id === scenario.finalStageId)
        ) {
            ctx.addIssue({
                code: 'custom',
                message: 'Tahap akhir tidak ditemukan.',
            });
        }
        for (const stage of scenario.stages) {
            const inner = [
                ...stage.materials.map((material) => material.id),
                ...stage.costs.map((cost) => cost.id),
            ];
            if (hasDuplicates(inner)) {
                ctx.addIssue({
                    code: 'custom',
                    message: `ID baris kembar di tahap "${stage.name}".`,
                });
            }
        }
        const { error } = orderStages(scenario.stages);
        if (error) ctx.addIssue({ code: 'custom', message: error });
    });

export const ownerHppWorkspaceSchema = z
    .object({
        version: z.literal(OWNER_HPP_WORKSPACE_VERSION),
        scenarios: z
            .array(scenarioSchema)
            .min(1)
            .max(OWNER_HPP_LIMITS.maxScenarios),
    })
    .superRefine((workspace, ctx) => {
        if (hasDuplicates(workspace.scenarios.map((scenario) => scenario.id))) {
            ctx.addIssue({ code: 'custom', message: 'ID skenario kembar.' });
        }
    });

export type OwnerHppWorkspace = z.infer<typeof ownerHppWorkspaceSchema>;
export type OwnerHppScenario = z.infer<typeof scenarioSchema>;
export type OwnerHppStage = z.infer<typeof stageSchema>;
export type OwnerHppMaterial = z.infer<typeof materialSchema>;
export type OwnerHppRawMaterial = z.infer<typeof rawMaterialSchema>;
export type OwnerHppStageMaterial = z.infer<typeof stageMaterialSchema>;
export type OwnerHppCost = z.infer<typeof costSchema>;

export type ParseWorkspaceResult =
    | { success: true; data: OwnerHppWorkspace }
    | { success: false; error: string };

/** Validates untrusted workspace JSON (client save, import, stored row). */
export function parseOwnerHppWorkspace(input: unknown): ParseWorkspaceResult {
    let serialized: string;
    try {
        serialized = JSON.stringify(input) ?? '';
    } catch {
        return { success: false, error: 'Dokumen tidak dapat dibaca.' };
    }
    if (serialized.length > OWNER_HPP_LIMITS.maxDocumentBytes) {
        return { success: false, error: 'Dokumen terlalu besar.' };
    }
    const parsed = ownerHppWorkspaceSchema.safeParse(input);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const where = issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
        return { success: false, error: `${issue.message}${where}` };
    }
    return { success: true, data: parsed.data };
}
