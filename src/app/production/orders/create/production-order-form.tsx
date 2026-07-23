"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createProductionOrderSchema } from "@/lib/schemas/production";
import {
  recommendedOutputHint,
  stageLabelId,
  resolveOutputLocationId,
  stageFromBomCategory,
  type LocationLike,
  type ProductionStage,
} from "@/lib/locations/resolve-location";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { formatLocalDate } from "@/lib/dates/parse-local-date";
import { createProductionOrder } from "@/actions/production/production";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toBaseQuantity } from "@/lib/utils/production-units";
import { Unit } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { z } from "zod";

// Hooks
import { usePlanningIntent } from "./hooks/use-planning-intent";
import { useBomMaterialPreview } from "./hooks/use-bom-material-preview";
import { useCompatibleMachines } from "./hooks/use-compatible-machines";
import { useCreateSpkDefaults } from "./hooks/use-create-spk-defaults";

// Components
import { CreateSpkStepper, type StepNumber } from "./components/create-spk-stepper";
import { StageProductSection } from "./components/stage-product-section";
import { PlanningQuantitySection } from "./components/planning-quantity-section";
import { LocationFlowCard } from "./components/location-flow-card";
import { MaklonSection } from "./components/maklon-section";
import { OrderMetaSection } from "./components/order-meta-section";
import { MaterialPreviewPanel } from "./components/material-preview-panel";
import { ReviewCommitSection } from "./components/review-commit-section";
import { RiskyOutputConfirmDialog } from "./components/risky-output-confirm-dialog";

export interface ProductionOrderFormProps {
  locations: {
    id: string;
    slug: string;
    name: string;
    locationPurpose?: string | null;
  }[];
  machines: { id: string; name: string; type: string }[];
  boms: {
    id: string;
    name: string;
    isDefault: boolean;
    productVariantId: string;
    category: "MIXING" | "EXTRUSION" | "PACKING" | "STANDARD" | "REWORK";
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
  salesOrderId?: string;
  variantId?: string;
  qtyHint?: number;
  priorityHint?: "URGENT" | "NORMAL" | "LOW";
}

const formSchema = createProductionOrderSchema;
type FormValues = z.infer<typeof formSchema>;

/** Build a materialInfo-like map from rawMaterials prop for ad-hoc lines */
function buildRawMaterialMeta(rawMaterials: { id: string; name: string; primaryUnit: string }[]) {
  const map: Record<string, { productVariantId: string; name: string; unit: string; stdQty: number; bomOutput: number; currentStock: number }> = {};
  for (const rm of rawMaterials) {
    map[rm.id] = { productVariantId: rm.id, name: rm.name, unit: rm.primaryUnit, stdQty: 0, bomOutput: 0, currentStock: 0 };
  }
  return map;
}

export function ProductionOrderForm({
  boms,
  machines,
  locations,
  customers = [],
  rawMaterials = [],
  salesOrderId,
  variantId,
  qtyHint,
  priorityHint,
}: ProductionOrderFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<StepNumber>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stage, setStage] = useState<ProductionStage>("mixing");
  const [selectedProductVariantId, setSelectedProductVariantId] = useState("");
  const [outputManuallyOverridden, setOutputManuallyOverridden] = useState(false);
  const [riskyConfirmed, setRiskyConfirmed] = useState(false);
  const [showRiskyDialog, setShowRiskyDialog] = useState(false);
  const [sourceOverrideId, setSourceOverrideId] = useState<string | null>(null);

  // P1: Track qtyHint for prefill
  const qtyHintRef = useRef(qtyHint);
  // P2: Dirty flag — prevent preview seed from overwriting user edits
  const itemsDirtyRef = useRef(false);

  const locationLikes = useMemo(() => locations as LocationLike[], [locations]);

  const form = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      plannedQuantity: 0,
      plannedStartDate: new Date(),
      items: [],
      locationId: "",
      bomId: "",
      machineId: "",
      salesOrderId: salesOrderId || "",
      notes: "",
      isMaklon: false,
      estimatedConversionCost: 0,
      priority: "NORMAL",
    },
  });

  // Watched values
  const watchBomId = useWatch({ control: form.control, name: "bomId" });
  const watchPlannedQty = useWatch({ control: form.control, name: "plannedQuantity" });
  const watchIsMaklon = useWatch({ control: form.control, name: "isMaklon" });
  const watchLocationId = useWatch({ control: form.control, name: "locationId" });
  const watchMachineId = useWatch({ control: form.control, name: "machineId" });
  const watchStartDate = useWatch({ control: form.control, name: "plannedStartDate" });
  const watchPriority = useWatch({ control: form.control, name: "priority" });
  const watchMaklonCustomerId = useWatch({ control: form.control, name: "maklonCustomerId" });
  const watchPlannedEndDate = useWatch({ control: form.control, name: "plannedEndDate" });
  const watchItems = useWatch({ control: form.control, name: "items" });

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

  const selectedBom = boms.find((b) => b.id === watchBomId);
  const bomOutputQty = selectedBom?.outputQuantity || 0;

  const planning = usePlanningIntent({
    bomOutputQty,
    productVariant: selectedBom?.productVariant || {},
    baseQty: (watchPlannedQty as number) || 0,
  });

  // Material preview — used ONLY for seeding form.items + materialInfo + suggestion
  const materialPreview = useBomMaterialPreview({
    bomId: (watchBomId as string) || "",
    sourceLocationId: effectiveSourceId,
    plannedQty: getEffectiveQty(),
    debounceMs: 500,
  });

  const compatibleMachines = useCompatibleMachines(machines, stage);

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
        if (stage === "mixing") return b.category === "MIXING";
        if (stage === "extrusion") return b.category === "EXTRUSION" || b.category === "STANDARD";
        if (stage === "packing") return b.category === "PACKING";
        if (stage === "rework") return b.category === "REWORK";
        return true;
      });
    });
  }, [boms, stage]);

  const availableBoms = useMemo(() => {
    if (!selectedProductVariantId) return [];
    return boms.filter((b) => {
      if (b.productVariantId !== selectedProductVariantId) return false;
      if (stage === "mixing") return b.category === "MIXING";
      if (stage === "extrusion") return b.category === "EXTRUSION" || b.category === "STANDARD";
      if (stage === "packing") return b.category === "PACKING";
      if (stage === "rework") return b.category === "REWORK";
      return true;
    });
  }, [boms, selectedProductVariantId, stage]);

  const outputIsRisky = isRiskyOutput(watchLocationId as string);
  const outputIsRecommended = isRecommendedOutput(watchLocationId as string);
  const sourceLocationName = locations.find((l) => l.id === effectiveSourceId)?.name || "—";
  const recommendedOutputName = locations.find((l) => l.id === outputLocationId)?.name || recommendedOutputHint(stage);

  function getEffectiveQty(): number {
    if (planning.planningMode === "batch" && bomOutputQty > 0) {
      return planning.batchCount * bomOutputQty;
    }
    if (planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit) {
      return toBaseQuantity(planning.enteredTargetQty, planning.unitMeta.conversionFactor);
    }
    return (watchPlannedQty as number) || 0;
  }

  // ── P0: Single source of truth ────────────────────────────────────
  // Seed form.items from preview when it settles, but only if user hasn't edited
  useEffect(() => {
    if (!materialPreview.isCalculating && materialPreview.items.length > 0 && !itemsDirtyRef.current) {
      form.setValue("items", materialPreview.items);
    }
  }, [materialPreview.items, materialPreview.isCalculating, form]);

  // Clear items when preview empties (e.g., bomId cleared)
  useEffect(() => {
    if (!materialPreview.isCalculating && materialPreview.items.length === 0 && watchBomId) {
      form.setValue("items", []);
      itemsDirtyRef.current = false;
    }
  }, [materialPreview.isCalculating, materialPreview.items.length, watchBomId, form]);

  // Reset dirty flag when effective qty changes (batch/sales mode too)
  const effectiveQtyForSeed = useMemo(() => {
    if (planning.planningMode === "batch" && bomOutputQty > 0) {
      return planning.batchCount * bomOutputQty;
    }
    if (planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit) {
      return toBaseQuantity(planning.enteredTargetQty, planning.unitMeta.conversionFactor);
    }
    return (watchPlannedQty as number) || 0;
  }, [planning.planningMode, planning.batchCount, planning.enteredTargetQty, planning.unitMeta, bomOutputQty, watchPlannedQty]);
  useEffect(() => {
    itemsDirtyRef.current = false;
  }, [watchBomId, effectiveQtyForSeed, effectiveSourceId]);

  // Display items: form items (edited) if available, else preview
  const displayItems = useMemo(() => {
    const formItems = (watchItems as { productVariantId: string; quantity: number }[] | undefined) || [];
    if (formItems.length > 0) return formItems;
    return materialPreview.items;
  }, [watchItems, materialPreview.items]);

  // Merged materialInfo: preview info + rawMaterials metadata for ad-hoc lines
  const mergedMaterialInfo = useMemo(() => {
    const rmMeta = buildRawMaterialMeta(rawMaterials);
    return { ...rmMeta, ...materialPreview.materialInfo };
  }, [rawMaterials, materialPreview.materialInfo]);

  // Stock issues: only for BOM-sourced items (have inventory snapshot in preview)
  const hasStockIssues = useMemo(() => {
    return displayItems.some((item) => {
      const fromBom = materialPreview.materialInfo[item.productVariantId];
      if (!fromBom) return false; // ad-hoc line, no inventory snapshot
      return item.quantity > fromBom.currentStock; // 0 stock → true shortage
    });
  }, [displayItems, materialPreview.materialInfo]);

  // ── Effects ─────────────────────────────────────────────────────

  // Auto-select product if only one available
  useEffect(() => {
    if (!selectedProductVariantId && products.length === 1) {
      setSelectedProductVariantId(products[0].id);
    }
  }, [products, selectedProductVariantId]);

  // Auto-select BOM if only one available
  useEffect(() => {
    if (selectedProductVariantId && !watchBomId && availableBoms.length === 1) {
      form.setValue("bomId", availableBoms[0].id);
    }
  }, [selectedProductVariantId, watchBomId, availableBoms, form]);

  // Set default output location when empty
  useEffect(() => {
    if (outputLocationId && !watchLocationId) {
      form.setValue("locationId", outputLocationId);
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
    const variantBoms = boms.filter((b) => b.productVariantId === variantId);
    if (variantBoms.length > 0) {
      // Prefer default BOM, else first
      const defaultBom = variantBoms.find((b) => b.isDefault) || variantBoms[0];
      const mappedStage = stageFromBomCategory(defaultBom.category);
      setStage(mappedStage);
      setSelectedProductVariantId(variantId);
      // Auto-select the BOM
      form.setValue("bomId", defaultBom.id);
      // Re-resolve output for the mapped stage
      const newOutput = resolveOutputLocationId(locationLikes, mappedStage, false);
      form.setValue("locationId", newOutput);
    } else {
      // No BOM found, just set product
      setSelectedProductVariantId(variantId);
    }
  }, [variantId, boms, locationLikes, form]);

  // P1: Apply qtyHint — after BOM selected (if variantId) or immediately (standalone)
  useEffect(() => {
    if (qtyHintRef.current && qtyHintRef.current > 0) {
      if (variantId && !watchBomId) return; // Wait for BOM from variant prefill
      form.setValue("plannedQuantity", qtyHintRef.current);
      qtyHintRef.current = 0; // Apply once
    }
  }, [form, watchBomId, variantId]);

  useEffect(() => {
    if (priorityHint) {
      form.setValue("priority", priorityHint);
    }
  }, [priorityHint, form]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleStageChange = useCallback((nextStage: ProductionStage) => {
    setStage(nextStage);
    setOutputManuallyOverridden(false);
    setSourceOverrideId(null);
    setSelectedProductVariantId("");
    form.setValue("bomId", "");
    form.setValue("plannedQuantity", 0);
    form.setValue("machineId", "");
    form.setValue("items", []);
    itemsDirtyRef.current = false;
    // Re-apply qtyHint if still pending
    if (qtyHintRef.current && qtyHintRef.current > 0) {
      form.setValue("plannedQuantity", qtyHintRef.current);
    }
    const newOutput = resolveOutputLocationId(locationLikes, nextStage, !!watchIsMaklon);
    form.setValue("locationId", newOutput);
    planning.reset();
  }, [locationLikes, watchIsMaklon, form, planning]);

  const handleMaklonChange = useCallback((checked: boolean) => {
    form.setValue("isMaklon", checked);
    setSourceOverrideId(null);
    setOutputManuallyOverridden(false);
    const newOutput = resolveOutputLocationId(locationLikes, stage, checked);
    form.setValue("locationId", newOutput);
  }, [locationLikes, stage, form]);

  const handleProductChange = useCallback((id: string) => {
    setSelectedProductVariantId(id);
    form.setValue("bomId", ""); // P3: Clear BOM when product changes
    planning.setEnteredTargetQty(0);
    planning.setPlanningMode("weight");
  }, [form, planning]);

  const handleBomChange = useCallback((id: string) => {
    form.setValue("bomId", id);
    planning.setEnteredTargetQty(0);
  }, [form, planning]);

  const handleOutputLocationChange = useCallback((val: string) => {
    form.setValue("locationId", val);
    setOutputManuallyOverridden(val !== outputLocationId);
  }, [form, outputLocationId]);

  const handleResetToDefault = useCallback(() => {
    form.setValue("locationId", outputLocationId);
    setOutputManuallyOverridden(false);
  }, [form, outputLocationId]);

  const handleAcceptSuggestedSource = useCallback(() => {
    const id = materialPreview.acceptSuggestedSource();
    if (id) {
      setSourceOverrideId(id);
    }
  }, [materialPreview]);

  // C1: Editable material handlers — all operate on form.items, mark dirty
  const handleItemQtyChange = useCallback((productVariantId: string, newQty: number) => {
    const current = (form.getValues("items") || []) as { productVariantId: string; quantity: number }[];
    const updated = current.map((i) =>
      i.productVariantId === productVariantId ? { ...i, quantity: newQty } : i,
    );
    form.setValue("items", updated);
    itemsDirtyRef.current = true;
  }, [form]);

  const handleAddItem = useCallback((productVariantId: string, qty: number) => {
    const current = (form.getValues("items") || []) as { productVariantId: string; quantity: number }[];
    form.setValue("items", [...current, { productVariantId, quantity: qty }]);
    itemsDirtyRef.current = true;
  }, [form]);

  const handleRemoveItem = useCallback((productVariantId: string) => {
    const current = (form.getValues("items") || []) as { productVariantId: string; quantity: number }[];
    form.setValue(
      "items",
      current.filter((i) => i.productVariantId !== productVariantId),
    );
    itemsDirtyRef.current = true;
  }, [form]);

  // ── Shared submit logic (P2: no closure issues) ─────────────────

  const doSubmit = useCallback(async (riskAck = false) => {
    // Inline qty calculation to avoid getEffectiveQty closure dependency
    let effectiveQty = 0;
    if (planning.planningMode === "batch" && bomOutputQty > 0) {
      effectiveQty = planning.batchCount * bomOutputQty;
    } else if (planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit) {
      effectiveQty = toBaseQuantity(planning.enteredTargetQty, planning.unitMeta.conversionFactor);
    } else {
      effectiveQty = (form.getValues("plannedQuantity") as number) || 0;
    }

    if (!effectiveQty || effectiveQty <= 0) {
      toast.warning("Target produksi harus lebih dari 0");
      return;
    }

    if (materialPreview.isCalculating) {
      toast.warning("Tunggu perhitungan bahan selesai");
      return;
    }

    if (outputIsRisky && !riskAck) {
      setShowRiskyDialog(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const formItems = (form.getValues("items") || []) as { productVariantId: string; quantity: number }[];

      const response = await createProductionOrder({
        ...form.getValues(),
        locationId: form.getValues("locationId"),
        materialSourceLocationId: effectiveSourceId || undefined,
        plannedQuantity: effectiveQty,
        plannedEnteredQuantity:
          planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit
            ? planning.enteredTargetQty
            : undefined,
        plannedEnteredUnit:
          planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit
            ? (planning.unitMeta.salesUnit as Unit)
            : undefined,
        plannedConversionFactorSnapshot:
          planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit
            ? planning.unitMeta.conversionFactor
            : undefined,
        // P0: Always use form items (edited truth)
        items: formItems,
        createPath: salesOrderId ? "sales_order" : variantId ? "demand_board" : "manual",
      });

      if (!response.success) {
        toast.error("Gagal membuat SPK", {
          description: response.error || "Silakan periksa data dan coba lagi",
        });
        return;
      }

      if (response.data) {
        const serverStatus = (response.data as { status?: string }).status;
        const statusLabel =
          serverStatus === "WAITING_MATERIAL" ? "Menunggu Bahan" : "DRAFT";
        toast.success(`SPK ${response.data.orderNumber} berhasil dibuat`, {
          description: `Status: ${statusLabel}`,
        });
        router.push(`/production/orders/${response.data.id}`);
      }
    } catch {
      toast.error("Gagal membuat SPK. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }, [materialPreview.isCalculating, outputIsRisky, effectiveSourceId, planning, bomOutputQty, salesOrderId, variantId, router, form]);

  function onSubmit() {
    doSubmit(riskyConfirmed);
  }

  // Step validation
  const canAdvanceFromStep1 = !!watchBomId && getEffectiveQty() > 0;
  const canAdvanceFromStep2 =
    !!watchLocationId &&
    (!watchIsMaklon || !!watchMaklonCustomerId);

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
      materialInfo={mergedMaterialInfo}
      suggestedSource={materialPreview.suggestedSource}
      isCalculating={materialPreview.isCalculating}
      hasStockIssues={hasStockIssues}
      onAcceptSuggestedSource={handleAcceptSuggestedSource}
      editable={step === 3}
      rawMaterials={rawMaterials}
      onItemQtyChange={handleItemQtyChange}
      onAddItem={handleAddItem}
      onRemoveItem={handleRemoveItem}
    />
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <CreateSpkStepper currentStep={step} />

        {/* Step 1: Spesifikasi */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Spesifikasi Produksi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <StageProductSection
                    stage={stage}
                    onStageChange={handleStageChange}
                    products={products}
                    selectedProductId={selectedProductVariantId}
                    onProductChange={handleProductChange}
                    boms={availableBoms}
                    selectedBomId={(watchBomId as string) || ""}
                    onBomChange={handleBomChange}
                    selectedBom={selectedBom}
                    machines={compatibleMachines}
                    selectedMachineId={(watchMachineId as string) || ""}
                    onMachineChange={(id) => form.setValue("machineId", id)}
                    plannedStartDate={(watchStartDate as Date) || new Date()}
                    onDateChange={(d) => form.setValue("plannedStartDate", d)}
                    plannedEndDate={watchPlannedEndDate as Date | undefined}
                    onEndDateChange={(d) => form.setValue("plannedEndDate", d)}
                  />

                  <PlanningQuantitySection
                    planningMode={planning.planningMode}
                    onPlanningModeChange={planning.setPlanningMode}
                    batchCount={planning.batchCount}
                    onBatchCountChange={planning.setBatchCount}
                    enteredTargetQty={planning.enteredTargetQty}
                    onEnteredTargetQtyChange={planning.setEnteredTargetQty}
                    basePlannedQty={(watchPlannedQty as number) || 0}
                    onBasePlannedQtyChange={(n) => form.setValue("plannedQuantity", n)}
                    bomOutputQty={bomOutputQty}
                    bomPrimaryUnit={(selectedBom?.productVariant?.primaryUnit as string) || ""}
                    bomProductVariant={selectedBom?.productVariant || {}}
                    hasAlternateUnit={planning.unitMeta.hasAlternateUnit}
                    salesUnit={planning.unitMeta.salesUnit || ""}
                    conversionFactor={planning.unitMeta.conversionFactor}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-6">{materialPanel}</div>
            </div>
          </div>
        )}

        {/* Step 2: Lokasi & meta */}
        {step === 2 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Lokasi & Meta</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <LocationFlowCard
                    stage={stage}
                    sourceLocationName={sourceLocationName}
                    outputLocationId={(watchLocationId as string) || ""}
                    onOutputLocationChange={handleOutputLocationChange}
                    activeLocations={activeLocations}
                    recommendedOutputId={outputLocationId}
                    recommendedOutputName={recommendedOutputName}
                    outputIsRisky={outputIsRisky}
                    outputIsRecommended={outputIsRecommended}
                    outputManuallyOverridden={outputManuallyOverridden}
                    onResetToDefault={handleResetToDefault}
                  />

                  <MaklonSection
                    form={form as unknown as Parameters<typeof MaklonSection>[0]["form"]}
                    isMaklon={!!watchIsMaklon}
                    onMaklonChange={handleMaklonChange}
                    customers={customers}
                  />

                  <OrderMetaSection
                    form={form as unknown as Parameters<typeof OrderMetaSection>[0]["form"]}
                    salesOrderId={salesOrderId}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-6">{materialPanel}</div>
            </div>
          </div>
        )}

        {/* Step 3: Review & buat */}
        {step === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ReviewCommitSection
                stage={stageLabelId(stage)}
                productName={selectedBom?.productVariant?.name || ""}
                bomName={selectedBom?.name || ""}
                targetSummary={
                  planning.planningMode === "batch"
                    ? `${planning.batchCount} batch × ${bomOutputQty} = ${getEffectiveQty()}`
                    : planning.planningMode === "sales" && planning.unitMeta.hasAlternateUnit
                      ? `${planning.enteredTargetQty} ${planning.unitMeta.salesUnit} × ${planning.unitMeta.conversionFactor} = ${getEffectiveQty()}`
                      : `${getEffectiveQty()}`
                }
                machineName={machines.find((m) => m.id === (watchMachineId as string))?.name || ""}
                startDate={formatLocalDate((watchStartDate as Date) || new Date())}
                endDate={watchPlannedEndDate ? formatLocalDate(watchPlannedEndDate as Date) : undefined}
                sourceName={sourceLocationName}
                outputName={locations.find((l) => l.id === (watchLocationId as string))?.name || "—"}
                priority={(watchPriority as string) || "NORMAL"}
                isMaklon={!!watchIsMaklon}
                predictedStatus={hasStockIssues ? "MENUNGGU_BAHAN" : "DRAFT"}
                outputIsRisky={outputIsRisky}
                isSubmitting={isSubmitting}
                isCalculating={materialPreview.isCalculating}
                isFormValid={canAdvanceFromStep1 && canAdvanceFromStep2}
              />
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-6">{materialPanel}</div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between gap-4 pt-4 border-t">
          <Button variant="outline" type="button" onClick={() => router.back()}>
            Batal
          </Button>
          <div className="flex gap-2">
            {step > 1 && (
              <Button
                variant="outline"
                type="button"
                onClick={() => setStep((s) => (s - 1) as StepNumber)}
              >
                Kembali
              </Button>
            )}
            {step < 3 && (
              <Button
                type="button"
                onClick={() => {
                  if (step === 1 && !canAdvanceFromStep1) {
                    toast.warning("Pilih produk, resep, dan target > 0");
                    return;
                  }
                  if (step === 2 && !canAdvanceFromStep2) {
                    toast.warning("Lengkapi lokasi output");
                    return;
                  }
                  setStep((s) => (s + 1) as StepNumber);
                }}
              >
                Lanjut →
              </Button>
            )}
          </div>
        </div>

        <input type="hidden" {...form.register("salesOrderId")} />
      </form>

      {/* C5: Risky output confirm dialog */}
      <RiskyOutputConfirmDialog
        open={showRiskyDialog}
        onOpenChange={setShowRiskyDialog}
        outputName={locations.find((l) => l.id === (watchLocationId as string))?.name || "—"}
        onConfirm={handleRiskyConfirm}
      />
    </Form>
  );
}
