import type { IdFactory } from './workspace-edit';
import type {
    OwnerHppCost,
    OwnerHppRawMaterial,
    OwnerHppScenario,
} from './workspace-schema';

const EXTRUSION_NAME = 'Ekstrusi HDPE';
const EXTRUSION_OUTPUT_QTY = 100;
const EXTRUSION_SCRAP_PERCENT = 25;
const EXTRUSION_OVERHEAD_PERCENT = 10;

const EXTRUSION_MATERIALS: ReadonlyArray<{ name: string; qty: number }> = [
    { name: 'HD PE', qty: 69 },
    { name: 'PE', qty: 30 },
    { name: 'Pewarna', qty: 0.5 },
    { name: 'Pelembab', qty: 0.5 },
];

function templateMaterial(
    entry: { name: string; qty: number },
    makeId: IdFactory,
): OwnerHppRawMaterial {
    return {
        id: makeId(),
        kind: 'raw',
        name: entry.name,
        unit: 'kg',
        qty: entry.qty,
        scrapPercent: EXTRUSION_SCRAP_PERCENT,
        price: 0,
        erpPrice: null,
    };
}

/**
 * One-stage extrusion scenario in the usual worksheet pattern: materials with
 * scrap, then labour, then 10% overhead. Prices and labour stay empty for the
 * owner to fill in (by hand or from the ERP).
 */
export function createExtrusionTemplateScenario(
    makeId: IdFactory,
): OwnerHppScenario {
    const stageId = makeId();
    const overhead: OwnerHppCost = {
        id: makeId(),
        label: 'Overhead',
        formula: 'percentage-of-pre-overhead',
        percentage: EXTRUSION_OVERHEAD_PERCENT,
    };
    return {
        id: makeId(),
        name: EXTRUSION_NAME,
        finalStageId: stageId,
        sellPrice: null,
        stages: [
            {
                id: stageId,
                name: EXTRUSION_NAME,
                outputUnit: 'kg',
                outputQty: EXTRUSION_OUTPUT_QTY,
                materials: EXTRUSION_MATERIALS.map((entry) =>
                    templateMaterial(entry, makeId),
                ),
                costs: [overhead],
            },
        ],
    };
}
