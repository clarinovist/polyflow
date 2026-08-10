import { useState, useEffect, useRef, useCallback } from 'react';
import { getBomWithInventory } from '@/actions/production/production';
import { toast } from 'sonner';

export interface MaterialRequirement {
    productVariantId: string;
    name: string;
    unit: string;
    stdQty: number;
    bomOutput: number;
    requiredQty: number;
    /** Stock at the warehouse this material resolves to */
    currentStock: number;
    /** Stock across every eligible warehouse */
    totalStock: number;
    /** Warehouse this material is drawn from — varies per material */
    sourceLocationId: string;
    sourceLocationName: string;
}

interface BomWithInventoryResult {
    success: boolean;
    /**
     * safeAction() always nests the action's return value under `data` — the
     * action itself already returns `{ data, meta }`, so this is
     * `{ data: { data: MaterialRequirement[], meta: {...} } }`, not a flat
     * array. See docs/plan/2026-08-10-fix-bom-material-preview-nested-data-shape.md.
     */
    data?: {
        data: MaterialRequirement[];
        meta?: {
            suggestedSourceLocationId?: string | null;
            suggestedSourceLocationName?: string | null;
        };
    };
    error?: string;
}

interface UseBomMaterialPreviewArgs {
    bomId: string;
    sourceLocationId: string;
    plannedQty: number;
    debounceMs?: number;
}

interface UseBomMaterialPreviewReturn {
    items: { productVariantId: string; quantity: number }[];
    materialInfo: Record<string, Omit<MaterialRequirement, 'requiredQty'>>;
    suggestedSource: { id: string; name: string } | null;
    isCalculating: boolean;
    error: string | null;
    /** Call when user accepts the suggested source */
    acceptSuggestedSource: () => string | null;
}

export function useBomMaterialPreview({
    bomId,
    sourceLocationId,
    plannedQty,
    debounceMs = 500,
}: UseBomMaterialPreviewArgs): UseBomMaterialPreviewReturn {
    const [items, setItems] = useState<
        { productVariantId: string; quantity: number }[]
    >([]);
    const [materialInfo, setMaterialInfo] = useState<
        Record<string, Omit<MaterialRequirement, 'requiredQty'>>
    >({});
    const [suggestedSource, setSuggestedSource] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestId = useRef(0);

    useEffect(() => {
        if (!bomId || plannedQty <= 0 || !sourceLocationId) {
            setItems([]);
            setMaterialInfo({});
            setSuggestedSource(null);
            setError(null);
            return;
        }

        const timer = setTimeout(async () => {
            setIsCalculating(true);
            setError(null);
            const thisId = ++requestId.current;

            try {
                const result = (await getBomWithInventory(
                    bomId,
                    sourceLocationId,
                    plannedQty,
                )) as BomWithInventoryResult;

                // Ignore stale response
                if (thisId !== requestId.current) return;

                if (result.success && result.data?.data) {
                    const materials = result.data.data;
                    const newItems = materials.map((item) => ({
                        productVariantId: item.productVariantId,
                        quantity: item.requiredQty,
                    }));
                    setItems(newItems);

                    const infoMap: Record<
                        string,
                        Omit<MaterialRequirement, 'requiredQty'>
                    > = {};
                    materials.forEach((item) => {
                        infoMap[item.productVariantId] = {
                            productVariantId: item.productVariantId,
                            name: item.name,
                            unit: item.unit,
                            stdQty: item.stdQty,
                            bomOutput: item.bomOutput,
                            currentStock: item.currentStock,
                            totalStock: item.totalStock,
                            sourceLocationId: item.sourceLocationId,
                            sourceLocationName: item.sourceLocationName,
                        };
                    });
                    setMaterialInfo(infoMap);

                    const suggestedId =
                        result.data.meta?.suggestedSourceLocationId || null;
                    const suggestedName =
                        result.data.meta?.suggestedSourceLocationName || null;
                    if (
                        suggestedId &&
                        suggestedName &&
                        suggestedId !== sourceLocationId
                    ) {
                        setSuggestedSource({
                            id: suggestedId,
                            name: suggestedName,
                        });
                    } else {
                        setSuggestedSource(null);
                    }
                } else {
                    setError(
                        result.error || 'Gagal menghitung kebutuhan bahan',
                    );
                    toast.error('Gagal menghitung resep', {
                        description: result.error || 'Error tidak diketahui',
                    });
                }
            } catch {
                if (requestId.current === thisId) {
                    setError('Terjadi kesalahan saat menghitung bahan');
                }
            } finally {
                if (requestId.current === thisId) {
                    setIsCalculating(false);
                }
            }
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [bomId, sourceLocationId, plannedQty, debounceMs]);

    const acceptSuggestedSource = useCallback(() => {
        if (suggestedSource) {
            const id = suggestedSource.id;
            setSuggestedSource(null);
            return id;
        }
        return null;
    }, [suggestedSource]);

    return {
        items,
        materialInfo,
        suggestedSource,
        isCalculating,
        error,
        acceptSuggestedSource,
    };
}
