'use client';

import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductionOrderSchema } from '@/lib/schemas/production';
import {
    recommendedOutputHint,
    stageLabelId,
    resolveMaterialConsumptionLocationId,
    resolveOutputLocationId,
    stageFromBomCategory,
    isEligibleMaterialSourceLocation,
    type LocationLike,
    type ProductionStage,
} from '@/lib/locations/resolve-location';
import { Button } from '@/components/ui/button';
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { OrderCustomerPicker } from '@/components/production/OrderCustomerPicker';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { formatLocalDate } from '@/lib/dates/parse-local-date';
import { Loader2 } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import { createProductionOrder } from '@/actions/production/production';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { toBaseQuantity } from '@/lib/utils/production-units';
import { Unit } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { z } from 'zod';

// Hooks
import { usePlanningIntent } from './hooks/use-planning-intent';
import { useBomMaterialPreview } from './hooks/use-bom-material-preview';
import { useDirectMaterialSources } from './hooks/use-direct-material-sources';
import { useCompatibleMachines } from './hooks/use-compatible-machines';
import { useCreateSpkDefaults } from './hooks/use-create-spk-defaults';

// Components
import {
    CreateSpkStepper,
    type StepNumber,
} from './components/create-spk-stepper';
import { StageProductSection } from './components/stage-product-section';
import { PlanningQuantitySection } from './components/planning-quantity-section';
import { LocationFlowCard } from './components/location-flow-card';
import { MaklonSection } from './components/maklon-section';
import { OrderMetaSection } from './components/order-meta-section';
import { MaterialPreviewPanel } from './components/material-preview-panel';
import { ReviewCommitSection } from './components/review-commit-section';
import { RiskyOutputConfirmDialog } from './components/risky-output-confirm-dialog';

export interface ProductionOrderFormProps {
    locations: {
        id: string;
        slug: string;
        name: string;
        locationPurpose?: string | null;
        locationType?: string;
    }[];
    machines: { id: string; name: string; type: string }[];
    machineStageMap?: Record<string, readonly string[]> | null;
    boms: {
        id: string;
        name: string;
        isDefault: boolean;
        productVariantId: string;
        category: 'MIXING' | 'EXTRUSION' | 'PACKING' | 'STANDARD' | 'REWORK';
        outputQuantity: number;
        productVariant: {
            name: string;
            primaryUnit: string;
            salesUnit?: string | null;
            conversionFactor?: number;
            product: { productType: string };
        };
        items: { productVariantId: string; quantity: number }[];
        salesOrderId?: string;
    }[];
    customers?: { id: string; name: string }[];
    rawMaterials?: { id: string; name: string; primaryUnit: string }[];
    /** Stock per (raw material, warehouse) — feeds the "Tambah bahan" picker */
    rawMaterialStock?: {
        productVariantId: string;
        locationId: string;
        quantity: number;
    }[];
    salesOrderId?: string;
    variantId?: string;
    qtyHint?: number;
    priorityHint?: 'URGENT' | 'NORMAL' | 'LOW';
}

const formSchema = createProductionOrderSchema;
type FormValues = z.infer<typeof formSchema>;

interface AdHocMaterialMeta {
    productVariantId: string;
    name: string;
    unit: string;
    stdQty: number;
    bomOutput: number;
    currentStock: number;
    totalStock: number;
    sourceLocationId: string;
    sourceLocationName: string;
}

/**
 * Build a materialInfo-like map from rawMaterials prop for ad-hoc lines that
 * haven't been added yet (still just an option in the "Tambah bahan"
 * dropdown). Once a line is actually added, `manualMaterialMeta` overrides
 * this with the warehouse + stock the user actually picked — see
 * `mergedMaterialInfo` below.
 */
function buildRawMaterialMeta(
    rawMaterials: { id: string; name: string; primaryUnit: string }[],
    sourceLocationId: string,
    sourceLocationName: string,
): Record<string, AdHocMaterialMeta> {
    const map: Record<string, AdHocMaterialMeta> = {};
    for (const rm of rawMaterials) {
        map[rm.id] = {
            productVariantId: rm.id,
            name: rm.name,
            unit: rm.primaryUnit,
            stdQty: 0,
            bomOutput: 0,
            currentStock: 0,
            totalStock: 0,
            sourceLocationId,
            sourceLocationName,
        };
    }
    return map;
}

export function ProductionOrderForm({
    boms,
    machines,
    machineStageMap,
    locations,
    customers = [],
    rawMaterials = [],
    rawMaterialStock = [],
    salesOrderId,
    variantId,
    qtyHint,
    priorityHint,
}: ProductionOrderFormProps) {
    const router = useRouter();
    const [step, setStep] = useState<StepNumber>(1);
    const [consumptionChoice, setConsumptionChoice] = useState<
        'TRANSFER' | 'DIRECT'
    >('TRANSFER');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [stage, setStage] = useState<ProductionStage>('mixing');
    const [selectedProductVariantId, setSelectedProductVariantId] =
        useState('');
    const [outputManuallyOverridden, setOutputManuallyOverridden] =
        useState(false);
    const [riskyConfirmed, setRiskyConfirmed] = useState(false);
    const [showRiskyDialog, setShowRiskyDialog] = useState(false);
    const [sourceOverrideId, setSourceOverrideId] = useState<string | null>(
        null,
    );
    // C2: Warehouse + stock the user actually picked per manually-added line
    // — see mergedMaterialInfo, which layers this over buildRawMaterialMeta's
    // placeholder defaults.
    const [manualMaterialMeta, setManualMaterialMeta] = useState<
        Record<
            string,
            Pick<
                AdHocMaterialMeta,
                'sourceLocationId' | 'sourceLocationName' | 'currentStock'
            >
        >
    >({});

    // P1: Track qtyHint for prefill
    const qtyHintRef = useRef(qtyHint);
    // P2: Dirty flag — prevent preview seed from overwriting user edits
    const itemsDirtyRef = useRef(false);

    const locationLikes = useMemo(
        () => locations as LocationLike[],
        [locations],
    );

    // C2: Warehouses offered by the "Tambah bahan" gudang picker — same
    // eligibility rule the automatic BOM resolver uses, so manual add offers
    // exactly the warehouses the system would ever draw material from.
    const eligibleSourceLocations = useMemo(
        () =>
            locationLikes
                .filter(isEligibleMaterialSourceLocation)
                .map((l) => ({ id: l.id, name: l.name })),
        [locationLikes],
    );

    // C2: productVariantId -> locationId -> stock, for the "Tambah bahan"
    // dropdown's stock badge.
    const rawMaterialStockMap = useMemo(() => {
        const map: Record<string, Record<string, number>> = {};
        for (const row of rawMaterialStock) {
            const byLocation = (map[row.productVariantId] ??= {});
            byLocation[row.locationId] = row.quantity;
        }
        return map;
    }, [rawMaterialStock]);

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema) as Resolver<FormValues>,
        defaultValues: {
            plannedQuantity: 0,
            plannedStartDate: new Date(),
            items: [],
            locationId: '',
            bomId: '',
            machineId: '',
            salesOrderId: salesOrderId || '',
            notes: '',
            isMaklon: false,
            estimatedConversionCost: 0,
            priority: 'NORMAL',
        },
    });

    // Lokasi Pemakaian Bahan state (separate from output locationId).
    const [consumptionOverrideId, setConsumptionOverrideId] = useState<
        string | null
    >(null);

    // Watched values
    const watchBomId = useWatch({ control: form.control, name: 'bomId' });
    const watchPlannedQty = useWatch({
        control: form.control,
        name: 'plannedQuantity',
    });
    const watchIsMaklon = useWatch({ control: form.control, name: 'isMaklon' });
    const allowDirect = stage === 'packing' && !watchIsMaklon;
    const consumptionMode = allowDirect ? consumptionChoice : 'TRANSFER';
    const isDirect = consumptionMode === 'DIRECT';
    const watchLocationId = useWatch({
        control: form.control,
        name: 'locationId',
    });
    const watchMachineId = useWatch({
        control: form.control,
        name: 'machineId',
    });
    const watchStartDate = useWatch({
        control: form.control,
        name: 'plannedStartDate',
    });
    const watchPriority = useWatch({ control: form.control, name: 'priority' });
    const watchMaklonCustomerId = useWatch({
        control: form.control,
        name: 'maklonCustomerId',
    });
    const watchPlannedEndDate = useWatch({
        control: form.control,
        name: 'plannedEndDate',
    });
    const watchItems = useWatch({ control: form.control, name: 'items' });
    const watchCustomerIds = useWatch({
        control: form.control,
        name: 'customerIds',
    });
    const watchNotes = useWatch({ control: form.control, name: 'notes' });
    const watchConversionCost = useWatch({
        control: form.control,
        name: 'estimatedConversionCost',
    });

    // Location defaults hook
    const {
        sourceLocationId: defaultSourceId,
        outputLocationId,
        activeLocations,
        isRiskyOutput,
        isRecommendedOutput,
    } = useCreateSpkDefaults({
        locations: locationLikes,
        stage,
        isMaklon: !!watchIsMaklon,
    });

    const effectiveSourceId = sourceOverrideId ?? defaultSourceId;
    const recommendedConsumptionId = useMemo(
        () => resolveMaterialConsumptionLocationId(locationLikes, stage, false),
        [locationLikes, stage],
    );
    const effectiveConsumptionId =
        consumptionOverrideId ?? recommendedConsumptionId;

    const selectedBom = boms.find((b) => b.id === watchBomId);
    const bomOutputQty = selectedBom?.outputQuantity || 0;

    const planning = usePlanningIntent({
        bomOutputQty,
        productVariant: selectedBom?.productVariant || {},
        baseQty: (watchPlannedQty as number) || 0,
    });

    // Material preview — used ONLY for seeding form.items + materialInfo + suggestion
    const materialPreview = useBomMaterialPreview({
        bomId: (watchBomId as string) || '',
        sourceLocationId: effectiveSourceId,
        plannedQty: getEffectiveQty(),
        debounceMs: 500,
    });

    const compatibleMachines = useCompatibleMachines(
        machines,
        stage,
        machineStageMap,
    );

    // Derived
    const products = useMemo(() => {
        const map = new Map<string, { id: string; name: string }>();
        boms.forEach((bom) => {
            if (!map.has(bom.productVariantId)) {
                map.set(bom.productVariantId, {
                    id: bom.productVariantId,
                    name: bom.productVariant.name,
                });
            }
        });
        return Array.from(map.values()).filter((p) => {
            const productBoms = boms.filter((b) => b.productVariantId === p.id);
            return productBoms.some((b) => {
                if (stage === 'mixing') return b.category === 'MIXING';
                if (stage === 'extrusion')
                    return (
                        b.category === 'EXTRUSION' || b.category === 'STANDARD'
                    );
                if (stage === 'packing') return b.category === 'PACKING';
                if (stage === 'rework') return b.category === 'REWORK';
                return true;
            });
        });
    }, [boms, stage]);

    const availableBoms = useMemo(() => {
        if (!selectedProductVariantId) return [];
        return boms.filter((b) => {
            if (b.productVariantId !== selectedProductVariantId) return false;
            if (stage === 'mixing') return b.category === 'MIXING';
            if (stage === 'extrusion')
                return b.category === 'EXTRUSION' || b.category === 'STANDARD';
            if (stage === 'packing') return b.category === 'PACKING';
            if (stage === 'rework') return b.category === 'REWORK';
            return true;
        });
    }, [boms, selectedProductVariantId, stage]);

    const outputIsRisky = isRiskyOutput(watchLocationId as string);
    const outputIsRecommended = isRecommendedOutput(watchLocationId as string);
    const consumptionManuallyOverridden =
        !!consumptionOverrideId &&
        consumptionOverrideId !== recommendedConsumptionId;
    const sourceLocationName =
        locations.find((l) => l.id === effectiveSourceId)?.name || '—';
    const recommendedOutputName =
        locations.find((l) => l.id === outputLocationId)?.name ||
        recommendedOutputHint(stage);

    function getEffectiveQty(): number {
        if (planning.planningMode === 'batch' && bomOutputQty > 0) {
            return planning.batchCount * bomOutputQty;
        }
        if (
            planning.planningMode === 'sales' &&
            planning.unitMeta.hasAlternateUnit
        ) {
            return toBaseQuantity(
                planning.enteredTargetQty,
                planning.unitMeta.conversionFactor,
            );
        }
        return (watchPlannedQty as number) || 0;
    }

    // ── P0: Single source of truth ────────────────────────────────────
    // Seed form.items from preview when it settles, but only if user hasn't edited
    useEffect(() => {
        if (
            !materialPreview.isCalculating &&
            materialPreview.items.length > 0 &&
            !itemsDirtyRef.current
        ) {
            form.setValue('items', materialPreview.items);
        }
    }, [materialPreview.items, materialPreview.isCalculating, form]);

    // Clear items when preview empties (e.g., bomId cleared)
    useEffect(() => {
        if (
            !materialPreview.isCalculating &&
            materialPreview.items.length === 0 &&
            watchBomId
        ) {
            form.setValue('items', []);
            itemsDirtyRef.current = false;
        }
    }, [
        materialPreview.isCalculating,
        materialPreview.items.length,
        watchBomId,
        form,
    ]);

    // Reset dirty flag only when the recipe itself changes — a different BOM
    // legitimately needs a fresh item list. Qty/source tweaks must NOT reset it:
    // once the user has manually edited the material list (removed/added/changed
    // a line), that edit should survive until they pick a different recipe, not
    // get silently discarded by adjusting the target quantity or source warehouse.
    // See docs/plan/2026-08-10-fix-spk-material-edit-revert.md.
    useEffect(() => {
        itemsDirtyRef.current = false;
    }, [watchBomId]);

    // Display items: form items (edited) if available, else preview
    const displayItems = useMemo(() => {
        const formItems =
            (watchItems as
                | { productVariantId: string; quantity: number }[]
                | undefined) || [];
        if (formItems.length > 0) return formItems;
        return materialPreview.items;
    }, [watchItems, materialPreview.items]);

    // Merged materialInfo: preview info (BOM) + rawMaterials defaults (still
    // just dropdown options) + manualMaterialMeta (the warehouse + stock the
    // user actually picked for lines they've added — takes priority over the
    // placeholder default, but BOM preview always wins since those items
    // aren't editable through the ad-hoc picker).
    const mergedMaterialInfo = useMemo(() => {
        const rmMeta = buildRawMaterialMeta(
            rawMaterials,
            effectiveSourceId,
            sourceLocationName,
        );
        const withManualOverrides: Record<string, AdHocMaterialMeta> = {
            ...rmMeta,
        };
        for (const [productVariantId, meta] of Object.entries(
            manualMaterialMeta,
        )) {
            const base = withManualOverrides[productVariantId];
            if (!base) continue;
            withManualOverrides[productVariantId] = {
                ...base,
                ...meta,
                // Sentinel: the only consumer of stdQty is the "has real
                // stock data" gate in material-preview-panel.tsx. A manually
                // added line with a resolved warehouse has real stock data
                // now, same as a BOM line.
                stdQty: 1,
                // User picked one specific warehouse — no cross-warehouse
                // fallback like the BOM auto-resolver does.
                totalStock: meta.currentStock,
            };
        }
        return { ...withManualOverrides, ...materialPreview.materialInfo };
    }, [
        rawMaterials,
        effectiveSourceId,
        sourceLocationName,
        manualMaterialMeta,
        materialPreview.materialInfo,
    ]);

    const directSourceLocations = locations.filter(
        (l) =>
            (!l.locationType || l.locationType === 'INTERNAL') &&
            isEligibleMaterialSourceLocation(l),
    );
    const directSources = useDirectMaterialSources({
        enabled: isDirect,
        bomId: (watchBomId as string) || '',
        items: displayItems,
        materialInfo: mergedMaterialInfo,
        locations: directSourceLocations,
    });
    const effectiveMaterialInfo = directSources.materialInfo;

    // Distinct warehouses the materials resolve to — a SPK regularly spans more
    // than one (packaging supplies, WIP batches, raw materials).
    const materialSourceNames = useMemo(() => {
        return Array.from(
            new Set(
                displayItems
                    .map(
                        (item) =>
                            effectiveMaterialInfo[item.productVariantId]
                                ?.sourceLocationName || '',
                    )
                    .filter(Boolean),
            ),
        );
    }, [displayItems, effectiveMaterialInfo]);

    // Stock issues: BOM lines always have an inventory snapshot; ad-hoc lines
    // do too once the user has picked a warehouse (stdQty sentinel = 1, see
    // mergedMaterialInfo). Compared against stock across all warehouses for
    // BOM lines so a material sitting in the packaging store no longer reads
    // as missing; ad-hoc lines compare against the one warehouse the user chose.
    const hasStockIssues = useMemo(() => {
        return displayItems.some((item) => {
            const info = effectiveMaterialInfo[item.productVariantId];
            if (!info || info.stdQty <= 0) return false; // no stock data yet
            return item.quantity > (info.totalStock ?? info.currentStock);
        });
    }, [displayItems, effectiveMaterialInfo]);

    // ── Effects ─────────────────────────────────────────────────────

    // Auto-select product if only one available
    useEffect(() => {
        if (!selectedProductVariantId && products.length === 1) {
            setSelectedProductVariantId(products[0].id);
        }
    }, [products, selectedProductVariantId]);

    // Auto-select BOM if only one available
    useEffect(() => {
        if (
            selectedProductVariantId &&
            !watchBomId &&
            availableBoms.length === 1
        ) {
            form.setValue('bomId', availableBoms[0].id);
        }
    }, [selectedProductVariantId, watchBomId, availableBoms, form]);

    // Set default output location when empty
    useEffect(() => {
        if (outputLocationId && !watchLocationId) {
            form.setValue('locationId', outputLocationId);
        }
    }, [outputLocationId, watchLocationId, form]);

    // Reset risky confirmed when output changes
    useEffect(() => {
        setRiskyConfirmed(false);
    }, [watchLocationId]);

    // P1: Prefill from demand board — resolve stage from BOM category
    useEffect(() => {
        if (!variantId) return;
        // Find default BOM for this variant to determine stage
        const variantBoms = boms.filter(
            (b) => b.productVariantId === variantId,
        );
        if (variantBoms.length > 0) {
            // Prefer default BOM, else first
            const defaultBom =
                variantBoms.find((b) => b.isDefault) || variantBoms[0];
            const mappedStage = stageFromBomCategory(defaultBom.category);
            setStage(mappedStage);
            setSelectedProductVariantId(variantId);
            // Auto-select the BOM
            form.setValue('bomId', defaultBom.id);
            // Re-resolve output for the mapped stage
            const newOutput = resolveOutputLocationId(
                locationLikes,
                mappedStage,
                false,
            );
            form.setValue('locationId', newOutput);
        } else {
            // No BOM found, just set product
            setSelectedProductVariantId(variantId);
        }
    }, [variantId, boms, locationLikes, form]);

    // P1: Apply qtyHint — after BOM selected (if variantId) or immediately (standalone)
    useEffect(() => {
        if (qtyHintRef.current && qtyHintRef.current > 0) {
            if (variantId && !watchBomId) return; // Wait for BOM from variant prefill
            form.setValue('plannedQuantity', qtyHintRef.current);
            qtyHintRef.current = 0; // Apply once
        }
    }, [form, watchBomId, variantId]);

    useEffect(() => {
        if (priorityHint) {
            form.setValue('priority', priorityHint);
        }
    }, [priorityHint, form]);

    // ── Handlers ────────────────────────────────────────────────────

    const handleStageChange = useCallback(
        (nextStage: ProductionStage) => {
            setStage(nextStage);
            setOutputManuallyOverridden(false);
            setSourceOverrideId(null);
            setSelectedProductVariantId('');
            form.setValue('bomId', '');
            form.setValue('plannedQuantity', 0);
            form.setValue('machineId', '');
            form.setValue('items', []);
            itemsDirtyRef.current = false;
            // Re-apply qtyHint if still pending
            if (qtyHintRef.current && qtyHintRef.current > 0) {
                form.setValue('plannedQuantity', qtyHintRef.current);
            }
            const newOutput = resolveOutputLocationId(
                locationLikes,
                nextStage,
                !!watchIsMaklon,
            );
            form.setValue('locationId', newOutput);
            planning.reset();
        },
        [locationLikes, watchIsMaklon, form, planning],
    );

    const handleMaklonChange = useCallback(
        (checked: boolean) => {
            form.setValue('isMaklon', checked);
            setSourceOverrideId(null);
            setOutputManuallyOverridden(false);
            const newOutput = resolveOutputLocationId(
                locationLikes,
                stage,
                checked,
            );
            form.setValue('locationId', newOutput);
        },
        [locationLikes, stage, form],
    );

    const handleProductChange = useCallback(
        (id: string) => {
            setSelectedProductVariantId(id);
            form.setValue('bomId', ''); // P3: Clear BOM when product changes
            planning.setEnteredTargetQty(0);
            planning.setPlanningMode('weight');
        },
        [form, planning],
    );

    const handleBomChange = useCallback(
        (id: string) => {
            form.setValue('bomId', id);
            planning.setEnteredTargetQty(0);
        },
        [form, planning],
    );

    const handleOutputLocationChange = useCallback(
        (val: string) => {
            form.setValue('locationId', val);
            setOutputManuallyOverridden(val !== outputLocationId);
        },
        [form, outputLocationId],
    );

    const handleConsumptionLocationChange = useCallback((val: string) => {
        setConsumptionOverrideId(val);
    }, []);

    const handleResetConsumptionToDefault = useCallback(() => {
        setConsumptionOverrideId(null);
    }, []);

    const handleResetToDefault = useCallback(() => {
        form.setValue('locationId', outputLocationId);
        setOutputManuallyOverridden(false);
    }, [form, outputLocationId]);

    const handleAcceptSuggestedSource = useCallback(() => {
        const id = materialPreview.acceptSuggestedSource();
        if (id) {
            setSourceOverrideId(id);
        }
    }, [materialPreview]);

    // C1: Editable material handlers — all operate on form.items, mark dirty
    const handleItemQtyChange = useCallback(
        (productVariantId: string, newQty: number) => {
            const current = (form.getValues('items') || []) as {
                productVariantId: string;
                quantity: number;
            }[];
            const updated = current.map((i) =>
                i.productVariantId === productVariantId
                    ? { ...i, quantity: newQty }
                    : i,
            );
            form.setValue('items', updated);
            itemsDirtyRef.current = true;
        },
        [form],
    );

    const handleAddItem = useCallback(
        (productVariantId: string, qty: number, locationId: string) => {
            if (isDirect) directSources.setSource(productVariantId, locationId);
            const current = (form.getValues('items') || []) as {
                productVariantId: string;
                quantity: number;
            }[];
            form.setValue('items', [
                ...current,
                { productVariantId, quantity: qty },
            ]);
            itemsDirtyRef.current = true;

            const locationName =
                locations.find((l) => l.id === locationId)?.name || '';
            setManualMaterialMeta((prev) => ({
                ...prev,
                [productVariantId]: {
                    sourceLocationId: locationId,
                    sourceLocationName: locationName,
                    currentStock:
                        rawMaterialStockMap[productVariantId]?.[locationId] ??
                        0,
                },
            }));
        },
        [form, locations, rawMaterialStockMap, isDirect, directSources],
    );

    const handleRemoveItem = useCallback(
        (productVariantId: string) => {
            const current = (form.getValues('items') || []) as {
                productVariantId: string;
                quantity: number;
            }[];
            form.setValue(
                'items',
                current.filter((i) => i.productVariantId !== productVariantId),
            );
            itemsDirtyRef.current = true;

            setManualMaterialMeta((prev) => {
                if (!(productVariantId in prev)) return prev;
                const next = { ...prev };
                delete next[productVariantId];
                return next;
            });
        },
        [form],
    );

    // ── Shared submit logic (P2: no closure issues) ─────────────────

    const doSubmit = useCallback(
        async (riskAck = false) => {
            // Inline qty calculation to avoid getEffectiveQty closure dependency
            let effectiveQty = 0;
            if (planning.planningMode === 'batch' && bomOutputQty > 0) {
                effectiveQty = planning.batchCount * bomOutputQty;
            } else if (
                planning.planningMode === 'sales' &&
                planning.unitMeta.hasAlternateUnit
            ) {
                effectiveQty = toBaseQuantity(
                    planning.enteredTargetQty,
                    planning.unitMeta.conversionFactor,
                );
            } else {
                effectiveQty =
                    (form.getValues('plannedQuantity') as number) || 0;
            }

            if (!effectiveQty || effectiveQty <= 0) {
                toast.warning('Target produksi harus lebih dari 0');
                return;
            }

            if (!directSources.ready) {
                toast.error(
                    directSources.error ||
                        'Lengkapi gudang asal bahan dan tunggu pemeriksaan stok.',
                );
                return;
            }
            if (materialPreview.error) {
                toast.error(
                    'Perhitungan bahan gagal. Ubah resep atau target untuk menghitung ulang.',
                );
                return;
            }
            if (materialPreview.isCalculating) {
                toast.warning('Tunggu perhitungan bahan selesai');
                return;
            }

            if (outputIsRisky && !riskAck) {
                setShowRiskyDialog(true);
                return;
            }

            setIsSubmitting(true);
            try {
                const formItems = (form.getValues('items') || []) as {
                    productVariantId: string;
                    quantity: number;
                }[];

                const response = await createProductionOrder({
                    ...form.getValues(),
                    locationId: form.getValues('locationId'),
                    materialSourceLocationId: effectiveSourceId || undefined,
                    materialConsumptionMode: consumptionMode,
                    materialConsumptionLocationId: isDirect
                        ? undefined
                        : effectiveConsumptionId || undefined,
                    plannedQuantity: effectiveQty,
                    plannedEnteredQuantity:
                        planning.planningMode === 'sales' &&
                        planning.unitMeta.hasAlternateUnit
                            ? planning.enteredTargetQty
                            : undefined,
                    plannedEnteredUnit:
                        planning.planningMode === 'sales' &&
                        planning.unitMeta.hasAlternateUnit
                            ? (planning.unitMeta.salesUnit as Unit)
                            : undefined,
                    plannedConversionFactorSnapshot:
                        planning.planningMode === 'sales' &&
                        planning.unitMeta.hasAlternateUnit
                            ? planning.unitMeta.conversionFactor
                            : undefined,
                    // P0: Always use form items (edited truth)
                    items: formItems.map((item) => ({
                        productVariantId: item.productVariantId,
                        quantity: item.quantity,
                        ...(isDirect
                            ? {
                                  sourceLocationId:
                                      effectiveMaterialInfo[
                                          item.productVariantId
                                      ]?.sourceLocationId,
                              }
                            : {}),
                    })),
                    createPath: salesOrderId
                        ? 'sales_order'
                        : variantId
                          ? 'demand_board'
                          : 'manual',
                });

                if (!response.success) {
                    toast.error('Gagal membuat SPK', {
                        description:
                            response.error ||
                            'Silakan periksa data dan coba lagi',
                    });
                    return;
                }

                if (response.data) {
                    const serverStatus = (response.data as { status?: string })
                        .status;
                    const statusLabel =
                        serverStatus === 'WAITING_MATERIAL'
                            ? 'Menunggu Bahan'
                            : 'DRAFT';
                    toast.success(
                        `SPK ${response.data.orderNumber} berhasil dibuat. Periksa kesiapan bahan sebelum produksi.`,
                        {
                            description: `Status: ${statusLabel} · Target ${response.data.plannedQuantity.toLocaleString('id-ID')} ${planning.unitMeta.primaryUnit}.`,
                        },
                    );
                    router.push(`/production/orders/${response.data.id}`);
                }
            } catch {
                toast.error('Gagal membuat SPK. Silakan coba lagi.');
            } finally {
                setIsSubmitting(false);
            }
        },
        [
            materialPreview.isCalculating,
            materialPreview.error,
            directSources.ready,
            directSources.error,
            consumptionMode,
            isDirect,
            effectiveMaterialInfo,
            outputIsRisky,
            effectiveSourceId,
            effectiveConsumptionId,
            planning,
            bomOutputQty,
            salesOrderId,
            variantId,
            router,
            form,
        ],
    );

    function onSubmit() {
        doSubmit(riskyConfirmed);
    }

    // Step validation
    const canAdvanceFromStep1 = !!watchBomId && getEffectiveQty() > 0;
    const canAdvanceFromStep2 =
        !!watchLocationId &&
        (!watchIsMaklon || !!watchMaklonCustomerId) &&
        directSources.ready;

    // P2: Risky dialog confirm — no setTimeout, direct call
    const handleRiskyConfirm = useCallback(() => {
        setRiskyConfirmed(true);
        setShowRiskyDialog(false);
        doSubmit(true);
    }, [doSubmit]);

    // Shared material preview panel
    const materialPanel = (
        <MaterialPreviewPanel
            sourceLocationName={sourceLocationName}
            items={displayItems}
            materialInfo={effectiveMaterialInfo}
            suggestedSource={isDirect ? null : materialPreview.suggestedSource}
            isCalculating={
                materialPreview.isCalculating || directSources.pending
            }
            hasStockIssues={hasStockIssues}
            error={materialPreview.error || directSources.error}
            onAcceptSuggestedSource={handleAcceptSuggestedSource}
            editable={step === 3}
            compact={step !== 3}
            consumptionMode={consumptionMode}
            rawMaterials={rawMaterials}
            sourceLocations={eligibleSourceLocations}
            defaultLocationId={effectiveSourceId}
            rawMaterialStock={rawMaterialStockMap}
            onItemQtyChange={handleItemQtyChange}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
        />
    );

    const planningPanel = (
        <aside
            className="space-y-3 lg:sticky lg:top-24"
            aria-label="Ringkasan rencana"
        >
            <div className="rounded-xl border bg-card p-4">
                <p className="text-xs font-medium text-muted-foreground">
                    Ringkasan rencana · {stageLabelId(stage)}
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {getEffectiveQty().toLocaleString('id-ID')}{' '}
                    {planning.unitMeta.primaryUnit}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {planning.planningMode === 'sales'
                        ? `${planning.enteredTargetQty} ${planning.unitMeta.salesUnit}`
                        : planning.planningMode === 'batch'
                          ? `${planning.batchCount} batch`
                          : 'Target produksi'}
                </p>
            </div>
            {materialPanel}
        </aside>
    );

    return (
        <Form {...form}>
            <form
                onSubmit={(event) => {
                    if (step !== 3) {
                        event.preventDefault();
                        toast.warning(
                            'Lanjutkan ke Periksa & buat sebelum membuat SPK.',
                        );
                        return;
                    }
                    // Validate the same base quantity that will be sent for all target modes.
                    form.setValue('plannedQuantity', getEffectiveQty());
                    return form.handleSubmit(onSubmit, (errors) => {
                        const field = Object.keys(
                            errors,
                        )[0] as keyof FormValues;
                        toast.error(
                            String(
                                errors[field]?.message ||
                                    'Periksa kembali data SPK sebelum membuatnya.',
                            ),
                        );
                        setStep(
                            [
                                'locationId',
                                'maklonCustomerId',
                                'estimatedConversionCost',
                                'customerIds',
                                'notes',
                                'priority',
                            ].includes(field)
                                ? 2
                                : field === 'items'
                                  ? 3
                                  : 1,
                        );
                    })(event);
                }}
                className="min-w-0 max-w-full space-y-6"
            >
                <CreateSpkStepper currentStep={step} />

                {/* Step 1: Spesifikasi */}
                {step === 1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>
                                        Apa yang akan diproduksi?
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <StageProductSection
                                        stage={stage}
                                        onStageChange={handleStageChange}
                                        products={products}
                                        selectedProductId={
                                            selectedProductVariantId
                                        }
                                        onProductChange={handleProductChange}
                                        boms={availableBoms}
                                        selectedBomId={
                                            (watchBomId as string) || ''
                                        }
                                        onBomChange={handleBomChange}
                                        selectedBom={selectedBom}
                                        machines={compatibleMachines}
                                        selectedMachineId={
                                            (watchMachineId as string) || ''
                                        }
                                        onMachineChange={(id) =>
                                            form.setValue('machineId', id)
                                        }
                                        plannedStartDate={
                                            (watchStartDate as Date) ||
                                            new Date()
                                        }
                                        onDateChange={(d) =>
                                            form.setValue('plannedStartDate', d)
                                        }
                                        plannedEndDate={
                                            watchPlannedEndDate as
                                                | Date
                                                | undefined
                                        }
                                        onEndDateChange={(d) =>
                                            form.setValue('plannedEndDate', d)
                                        }
                                    >
                                        <PlanningQuantitySection
                                            planningMode={planning.planningMode}
                                            onPlanningModeChange={
                                                planning.setPlanningMode
                                            }
                                            batchCount={planning.batchCount}
                                            onBatchCountChange={
                                                planning.setBatchCount
                                            }
                                            enteredTargetQty={
                                                planning.enteredTargetQty
                                            }
                                            onEnteredTargetQtyChange={
                                                planning.setEnteredTargetQty
                                            }
                                            basePlannedQty={
                                                (watchPlannedQty as number) || 0
                                            }
                                            onBasePlannedQtyChange={(n) =>
                                                form.setValue(
                                                    'plannedQuantity',
                                                    n,
                                                )
                                            }
                                            bomOutputQty={bomOutputQty}
                                            bomPrimaryUnit={
                                                (selectedBom?.productVariant
                                                    ?.primaryUnit as string) ||
                                                ''
                                            }
                                            bomProductVariant={
                                                selectedBom?.productVariant ||
                                                {}
                                            }
                                            hasAlternateUnit={
                                                planning.unitMeta
                                                    .hasAlternateUnit
                                            }
                                            salesUnit={
                                                planning.unitMeta.salesUnit ||
                                                ''
                                            }
                                            conversionFactor={
                                                planning.unitMeta
                                                    .conversionFactor
                                            }
                                        />
                                    </StageProductSection>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="lg:col-span-1">{planningPanel}</div>
                    </div>
                )}

                {/* Step 2: Lokasi & meta */}
                {step === 2 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Bahan & tujuan</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-6">
                                    <MaklonSection
                                        form={
                                            form as unknown as Parameters<
                                                typeof MaklonSection
                                            >[0]['form']
                                        }
                                        isMaklon={!!watchIsMaklon}
                                        onMaklonChange={handleMaklonChange}
                                        customers={customers}
                                    />
                                    <LocationFlowCard
                                        stage={stage}
                                        consumptionMode={consumptionMode}
                                        onConsumptionModeChange={
                                            setConsumptionChoice
                                        }
                                        allowDirect={allowDirect}
                                        materials={displayItems.map((item) => ({
                                            ...item,
                                            name:
                                                effectiveMaterialInfo[
                                                    item.productVariantId
                                                ]?.name ||
                                                item.productVariantId,
                                            unit:
                                                effectiveMaterialInfo[
                                                    item.productVariantId
                                                ]?.unit || '',
                                            sourceLocationId:
                                                effectiveMaterialInfo[
                                                    item.productVariantId
                                                ]?.sourceLocationId || '',
                                            sourceLocationName:
                                                effectiveMaterialInfo[
                                                    item.productVariantId
                                                ]?.sourceLocationName || '',
                                            currentStock:
                                                effectiveMaterialInfo[
                                                    item.productVariantId
                                                ]?.currentStock,
                                        }))}
                                        sourceLocations={directSourceLocations}
                                        onMaterialSourceChange={
                                            directSources.setSource
                                        }
                                        checkingStock={directSources.pending}
                                        stockError={directSources.error}
                                        onRetryStock={directSources.retry}
                                        sourceLocationName={sourceLocationName}
                                        materialSourceNames={
                                            materialSourceNames
                                        }
                                        outputLocationId={
                                            (watchLocationId as string) || ''
                                        }
                                        onOutputLocationChange={
                                            handleOutputLocationChange
                                        }
                                        consumptionLocationId={
                                            effectiveConsumptionId || ''
                                        }
                                        onConsumptionLocationChange={
                                            handleConsumptionLocationChange
                                        }
                                        activeLocations={activeLocations}
                                        recommendedOutputId={outputLocationId}
                                        recommendedOutputName={
                                            recommendedOutputName
                                        }
                                        recommendedConsumptionId={
                                            recommendedConsumptionId
                                        }
                                        outputIsRisky={outputIsRisky}
                                        outputIsRecommended={
                                            outputIsRecommended
                                        }
                                        consumptionManuallyOverridden={
                                            consumptionManuallyOverridden
                                        }
                                        outputManuallyOverridden={
                                            outputManuallyOverridden
                                        }
                                        onResetToDefault={handleResetToDefault}
                                        onResetConsumptionToDefault={
                                            handleResetConsumptionToDefault
                                        }
                                    />

                                    <h3 className="border-t pt-5 font-semibold">
                                        Tujuan & instruksi
                                    </h3>
                                    <FormField
                                        control={form.control}
                                        name="customerIds"
                                        render={({ field }) => (
                                            <FormItem>
                                                <OrderCustomerPicker
                                                    customers={customers}
                                                    value={field.value ?? []}
                                                    onChange={field.onChange}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <OrderMetaSection
                                        form={
                                            form as unknown as Parameters<
                                                typeof OrderMetaSection
                                            >[0]['form']
                                        }
                                        salesOrderId={salesOrderId}
                                    />
                                </CardContent>
                            </Card>
                        </div>

                        <div className="lg:col-span-1">{planningPanel}</div>
                    </div>
                )}

                {/* Step 3: Review & buat */}
                {step === 3 && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-1 lg:col-start-3 lg:row-start-1">
                            <ReviewCommitSection
                                stage={stageLabelId(stage)}
                                productName={
                                    selectedBom?.productVariant?.name || ''
                                }
                                bomName={selectedBom?.name || ''}
                                targetSummary={
                                    planning.planningMode === 'batch'
                                        ? `${planning.batchCount} batch × ${bomOutputQty} ${planning.unitMeta.primaryUnit} = ${getEffectiveQty()} ${planning.unitMeta.primaryUnit}`
                                        : planning.planningMode === 'sales' &&
                                            planning.unitMeta.hasAlternateUnit
                                          ? `${planning.enteredTargetQty} ${planning.unitMeta.salesUnit} = ${getEffectiveQty()} ${planning.unitMeta.primaryUnit}`
                                          : `${getEffectiveQty()} ${planning.unitMeta.primaryUnit}`
                                }
                                machineName={
                                    machines.find(
                                        (m) =>
                                            m.id === (watchMachineId as string),
                                    )?.name || ''
                                }
                                startDate={formatLocalDate(
                                    (watchStartDate as Date) || new Date(),
                                )}
                                endDate={
                                    watchPlannedEndDate
                                        ? formatLocalDate(
                                              watchPlannedEndDate as Date,
                                          )
                                        : undefined
                                }
                                sourceName={
                                    materialSourceNames.join(' · ') ||
                                    sourceLocationName
                                }
                                consumptionMode={consumptionMode}
                                consumptionName={
                                    locations.find(
                                        (l) => l.id === effectiveConsumptionId,
                                    )?.name || '—'
                                }
                                outputName={
                                    locations.find(
                                        (l) =>
                                            l.id ===
                                            (watchLocationId as string),
                                    )?.name || '—'
                                }
                                priority={(watchPriority as string) || 'NORMAL'}
                                isMaklon={!!watchIsMaklon}
                                predictedStatus={
                                    materialPreview.error || materialPreview.isCalculating || directSources.pending || directSources.error || displayItems.length === 0
                                        ? 'UNKNOWN'
                                        : hasStockIssues ? 'MENUNGGU_BAHAN' : 'DRAFT'
                                }
                                outputIsRisky={outputIsRisky}
                                customerNames={customers
                                    .filter(
                                        (customer) =>
                                            (watchCustomerIds || []).includes(
                                                customer.id,
                                            ) ||
                                            (!!watchIsMaklon &&
                                                customer.id ===
                                                    watchMaklonCustomerId),
                                    )
                                    .map((customer) => customer.name)}
                                maklonCustomerName={
                                    customers.find(
                                        (customer) =>
                                            customer.id ===
                                            watchMaklonCustomerId,
                                    )?.name
                                }
                                conversionCost={formatRupiah(
                                    Number(watchConversionCost || 0),
                                )}
                                notes={watchNotes || ''}
                                linkedSalesOrder={!!salesOrderId}
                                onEdit={() => setStep(1)}
                            />
                        </div>

                        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
                            <p className="mb-3 text-sm text-muted-foreground">
                                Periksa kebutuhan bahan. Penyesuaian hanya
                                berlaku untuk SPK ini, bukan resep utama.
                            </p>
                            {itemsDirtyRef.current && (
                                <p className="mb-3 rounded-lg border bg-muted p-3 text-sm">
                                    Bahan disesuaikan manual. Periksa kembali
                                    jumlahnya jika target berubah.
                                </p>
                            )}
                            {materialPanel}
                        </div>
                    </div>
                )}

                {/* Navigation */}
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => router.back()}
                    >
                        Batal
                    </Button>
                    <p className="text-xs text-muted-foreground">
                        Langkah {step} dari 3
                        {step === 3 &&
                            ' · Membuat 1 SPK, belum memulai produksi'}
                    </p>
                    <div className="flex min-w-0 flex-wrap justify-end gap-2">
                        {step > 1 && (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() =>
                                    setStep((s) => (s - 1) as StepNumber)
                                }
                            >
                                Kembali
                            </Button>
                        )}
                        {step < 3 && (
                            <Button
                                type="button"
                                onClick={() => {
                                    if (step === 1 && !canAdvanceFromStep1) {
                                        toast.warning(
                                            'Pilih produk, resep, dan target > 0',
                                        );
                                        return;
                                    }
                                    if (step === 2 && !canAdvanceFromStep2) {
                                        toast.warning(
                                            !watchLocationId
                                                ? 'Pilih lokasi penyimpanan hasil'
                                                : watchIsMaklon &&
                                                    !watchMaklonCustomerId
                                                  ? 'Pilih customer pemilik bahan maklon'
                                                  : directSources.error ||
                                                    'Lengkapi asal bahan dan tunggu pemeriksaan stok',
                                        );
                                        return;
                                    }
                                    setStep((s) => (s + 1) as StepNumber);
                                }}
                            >
                                {step === 1
                                    ? 'Lanjut: Bahan & tujuan →'
                                    : 'Lanjut: Periksa & buat →'}
                            </Button>
                        )}
                        {step === 3 && (
                            <Button
                                type="submit"
                                className="min-h-11"
                                disabled={
                                    isSubmitting ||
                                    materialPreview.isCalculating ||
                                    !!materialPreview.error ||
                                    directSources.pending ||
                                    !canAdvanceFromStep1 ||
                                    !canAdvanceFromStep2
                                }
                                aria-busy={isSubmitting}
                            >
                                {isSubmitting && (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                )}
                                {isSubmitting ? 'Membuat SPK…' : 'Buat SPK'}
                            </Button>
                        )}
                    </div>
                </div>

                <input type="hidden" {...form.register('salesOrderId')} />
            </form>

            {/* C5: Risky output confirm dialog */}
            <RiskyOutputConfirmDialog
                open={showRiskyDialog}
                onOpenChange={setShowRiskyDialog}
                outputName={
                    locations.find((l) => l.id === (watchLocationId as string))
                        ?.name || '—'
                }
                onConfirm={handleRiskyConfirm}
            />
        </Form>
    );
}
