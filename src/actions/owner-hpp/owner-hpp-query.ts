import {
    readHppPriceSimulatorDefault,
    type HppPriceSimulatorDefaultDTO,
} from '@/actions/production/hpp-price-simulator-query';
import { ValidationError } from '@/lib/errors/errors';
import type { ErpBomNode } from '@/lib/owner-hpp/erp-chain';
import {
    OWNER_HPP_LIMITS,
    parseOwnerHppWorkspace,
    type OwnerHppWorkspace,
} from '@/lib/owner-hpp/workspace-schema';
import { createDefaultWorkspace, randomId } from '@/lib/owner-hpp/workspace-edit';
import type { HppSimulatorNumberInput } from '@/lib/production/hpp-price-simulator';
import type { Prisma, PrismaClient } from '@prisma/client';

/** Deepest BOM nesting followed when building a chain (observed max is 4). */
export const ERP_CHAIN_MAX_DEPTH = 6;

export interface StoredOwnerHppWorkspace {
    workspace: OwnerHppWorkspace;
    isStored: boolean;
    updatedAt: string | null;
    notice: string | null;
}

export async function readOwnerHppWorkspace(
    db: PrismaClient,
    userId: string,
): Promise<StoredOwnerHppWorkspace> {
    const row = await db.ownerHppWorkspace.findUnique({
        where: { userId },
        select: { document: true, updatedAt: true },
    });
    if (!row) {
        return {
            workspace: createDefaultWorkspace(randomId),
            isStored: false,
            updatedAt: null,
            notice: null,
        };
    }

    const parsed = parseOwnerHppWorkspace(row.document);
    if (!parsed.success) {
        return {
            workspace: createDefaultWorkspace(randomId),
            isStored: true,
            updatedAt: row.updatedAt.toISOString(),
            notice: `Dokumen tersimpan tidak valid (${parsed.error}). Lembar kosong dipakai dan dokumen lama baru tertimpa saat Anda menyimpan.`,
        };
    }
    return {
        workspace: parsed.data,
        isStored: true,
        updatedAt: row.updatedAt.toISOString(),
        notice: null,
    };
}

/** The only write this feature makes, and only to its own table. */
export async function writeOwnerHppWorkspace(
    db: PrismaClient,
    userId: string,
    workspace: OwnerHppWorkspace,
): Promise<{ updatedAt: string }> {
    const document = workspace as unknown as Prisma.InputJsonValue;
    const row = await db.ownerHppWorkspace.upsert({
        where: { userId },
        create: { userId, document },
        update: { document },
        select: { updatedAt: true },
    });
    return { updatedAt: row.updatedAt.toISOString() };
}

function numberOf(input: HppSimulatorNumberInput): number | null {
    return input.mode === 'default' ? input.defaultSnapshot.value : input.value;
}

function toNode(dto: HppPriceSimulatorDefaultDTO): ErpBomNode {
    return {
        variantId: dto.variant.id,
        variantName: dto.variant.name,
        outputUnit: String(dto.variant.primaryOutputUnit),
        bomName: dto.bom.name,
        outputQuantity: numberOf(dto.bom.outputQuantity) ?? 0,
        materials: dto.materials.map((material) => ({
            variantId: material.productVariantId,
            name: material.name,
            unit: String(material.primaryUnit),
            quantity: numberOf(material.quantity) ?? 0,
            scrapPercent: numberOf(material.scrapPercentage) ?? 0,
            unitCost: numberOf(material.unitCost),
        })),
    };
}

async function filterVariantsWithDefaultBom(
    db: PrismaClient,
    variantIds: readonly string[],
): Promise<string[]> {
    if (variantIds.length === 0) return [];
    const rows = await db.bom.findMany({
        where: {
            productVariantId: { in: [...variantIds] },
            isActive: true,
            isDefault: true,
            archivedAt: null,
            productVariant: { archivedAt: null },
        },
        select: { productVariantId: true },
    });
    return [...new Set(rows.map((row) => row.productVariantId))];
}

async function readChildNode(
    db: PrismaClient,
    variantId: string,
): Promise<ErpBomNode | null> {
    try {
        const dto = await readHppPriceSimulatorDefault(db, variantId);
        return dto ? toNode(dto) : null;
    } catch (error) {
        // One broken sub-BOM must not block the rest of the chain; the mapper
        // then treats that product as a plain raw material.
        if (error instanceof ValidationError) return null;
        throw error;
    }
}

/**
 * Read-only walk of default BOMs from the final product down through the
 * products that are themselves produced in-house. Breadth-first, one BOM read
 * per product that has one, bounded by depth and node count.
 */
export async function readOwnerHppErpNodes(
    db: PrismaClient,
    rootVariantId: string,
): Promise<Map<string, ErpBomNode>> {
    const nodes = new Map<string, ErpBomNode>();
    const seen = new Set<string>([rootVariantId]);

    const rootDto = await readHppPriceSimulatorDefault(db, rootVariantId);
    if (!rootDto) return nodes;
    nodes.set(rootVariantId, toNode(rootDto));

    let frontier = [rootVariantId];
    for (let depth = 0; depth < ERP_CHAIN_MAX_DEPTH; depth += 1) {
        const childIds = frontier
            .flatMap((id) => nodes.get(id)?.materials ?? [])
            .map((material) => material.variantId)
            .filter((id) => !seen.has(id));
        childIds.forEach((id) => seen.add(id));

        const producible = await filterVariantsWithDefaultBom(db, [
            ...new Set(childIds),
        ]);
        frontier = [];
        for (const variantId of producible) {
            if (nodes.size >= OWNER_HPP_LIMITS.maxStages) return nodes;
            const node = await readChildNode(db, variantId);
            if (!node) continue;
            nodes.set(variantId, node);
            frontier.push(variantId);
        }
        if (frontier.length === 0) break;
    }
    return nodes;
}
