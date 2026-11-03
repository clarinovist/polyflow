import {
    OWNER_HPP_LIMITS,
    type OwnerHppMaterial,
    type OwnerHppStage,
} from './workspace-schema';

export interface ErpBomMaterial {
    variantId: string;
    name: string;
    unit: string;
    quantity: number;
    scrapPercent: number;
    /** Resolved ERP unit cost; null when the ERP has no cost for it. */
    unitCost: number | null;
}

export interface ErpBomNode {
    variantId: string;
    variantName: string;
    outputUnit: string;
    bomName: string;
    outputQuantity: number;
    materials: readonly ErpBomMaterial[];
}

export interface ErpChainInput {
    rootVariantId: string;
    /** Default BOM per product variant, already fetched (read-only). */
    nodes: ReadonlyMap<string, ErpBomNode>;
    /** Date label stored beside each ERP price, e.g. 2026-11-03. */
    fetchedAt: string;
}

export interface ErpChainResult {
    stages: OwnerHppStage[];
    finalStageId: string;
    warnings: string[];
}

function fit(text: string, max: number, fallback: string): string {
    const trimmed = text.trim().slice(0, max).trim();
    return trimmed.length > 0 ? trimmed : fallback;
}

/** Variants to expand as stages: breadth-first from the root, capped. */
function selectExpandable(input: ErpChainInput): Set<string> {
    const selected = new Set<string>();
    const queue = [input.rootVariantId];
    while (queue.length > 0 && selected.size < OWNER_HPP_LIMITS.maxStages) {
        const variantId = queue.shift() as string;
        const node = input.nodes.get(variantId);
        if (!node || selected.has(variantId)) continue;
        selected.add(variantId);
        for (const material of node.materials) queue.push(material.variantId);
    }
    return selected;
}

/**
 * Maps a fetched default-BOM tree to calculator stages (upstream first).
 * A product that several BOMs use becomes one stage with several consumers.
 */
export function buildStagesFromErp(input: ErpChainInput): ErpChainResult {
    const warnings: string[] = [];
    if (!input.nodes.has(input.rootVariantId)) {
        return {
            stages: [],
            finalStageId: '',
            warnings: ['Produk ini belum punya BOM default yang aktif.'],
        };
    }

    const expandable = selectExpandable(input);
    const stageIdByVariant = new Map<string, string>();
    const stages: OwnerHppStage[] = [];
    let materialCounter = 0;

    const nextMaterialId = () => `m${++materialCounter}`;

    function toMaterials(
        node: ErpBomNode,
        path: ReadonlySet<string>,
    ): OwnerHppMaterial[] {
        const visible = node.materials.slice(0, OWNER_HPP_LIMITS.maxMaterials);
        if (visible.length < node.materials.length) {
            warnings.push(
                `Bahan "${node.variantName}" dipotong ke ${OWNER_HPP_LIMITS.maxMaterials} baris.`,
            );
        }
        return visible.map((material): OwnerHppMaterial => {
            const isChild = expandable.has(material.variantId);
            if (isChild && path.has(material.variantId)) {
                warnings.push(
                    `Siklus BOM di "${material.name}" diperlakukan sebagai bahan baku.`,
                );
            } else if (isChild) {
                return {
                    id: nextMaterialId(),
                    kind: 'stage',
                    from: visit(material.variantId, path),
                    qty: material.quantity,
                    scrapPercent: material.scrapPercent,
                };
            } else if (input.nodes.has(material.variantId)) {
                warnings.push(
                    `Batas ${OWNER_HPP_LIMITS.maxStages} tahap tercapai; "${material.name}" dimasukkan sebagai bahan baku.`,
                );
            }
            if (material.unitCost === null) {
                warnings.push(`Harga ERP untuk "${material.name}" belum ada.`);
            }
            return {
                id: nextMaterialId(),
                kind: 'raw',
                name: fit(material.name, OWNER_HPP_LIMITS.maxTextLength, 'Bahan'),
                unit: fit(material.unit, OWNER_HPP_LIMITS.maxUnitLength, 'KG'),
                qty: material.quantity,
                scrapPercent: material.scrapPercent,
                price: material.unitCost ?? 0,
                erpPrice: material.unitCost,
                erpAt: input.fetchedAt,
            };
        });
    }

    function visit(variantId: string, parents: ReadonlySet<string>): string {
        const existing = stageIdByVariant.get(variantId);
        if (existing) return existing;

        const node = input.nodes.get(variantId) as ErpBomNode;
        const path = new Set(parents).add(variantId);
        const materials = toMaterials(node, path);
        if (!(node.outputQuantity > 0)) {
            warnings.push(
                `Jumlah keluaran BOM "${node.variantName}" tidak valid; dipakai 1.`,
            );
        }
        const stageId = `s${stages.length + 1}`;
        stageIdByVariant.set(variantId, stageId);
        stages.push({
            id: stageId,
            name: fit(node.variantName, OWNER_HPP_LIMITS.maxTextLength, 'Tahap'),
            outputUnit: fit(node.outputUnit, OWNER_HPP_LIMITS.maxUnitLength, 'KG'),
            outputQty: node.outputQuantity > 0 ? node.outputQuantity : 1,
            materials,
            costs: [],
        });
        return stageId;
    }

    const finalStageId = visit(input.rootVariantId, new Set());
    return { stages, finalStageId, warnings };
}
