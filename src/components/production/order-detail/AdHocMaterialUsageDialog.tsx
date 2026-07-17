"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Location, ProductVariant } from "@prisma/client";
import { ExtendedProductionOrder } from "./types";
import { recordAdHocMaterialUsage } from "@/actions/production/production";
import { productionComponentLabels } from "@/lib/labels";
import { WAREHOUSE_SLUGS } from "@/lib/constants/locations";
import { sanitizeHtml } from "@/lib/utils/sanitize";

interface AdHocMaterialUsageDialogProps {
  order: ExtendedProductionOrder;
  locations: Location[];
  rawMaterials: ProductVariant[];
}

export function AdHocMaterialUsageDialog({
  order,
  locations,
  rawMaterials,
}: AdHocMaterialUsageDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [quantity, setQuantity] = useState<number>(0);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [reason, setReason] = useState("");
  const router = useRouter();
  // Stable per-submit idempotency key — generated once at mount, reset on open
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  // Default location: Raw Material Warehouse
  const defaultLocationId = useMemo(() => {
    const rmLoc = locations.find(
      (l) => l.slug === WAREHOUSE_SLUGS.RAW_MATERIAL
    );
    return rmLoc?.id || locations[0]?.id || "";
  }, [locations]);

  // Reset form on open
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setSelectedVariantId("");
      setQuantity(0);
      setSelectedLocationId(defaultLocationId);
      setReason("");
      setRequestId(crypto.randomUUID());
    }
  };

  const selectedVariant = rawMaterials.find(
    (m) => m.id === selectedVariantId
  );

  const handleSubmit = async () => {
    if (!selectedVariantId || quantity <= 0) {
      toast.error("Pilih material dan masukkan jumlah yang valid.");
      return;
    }

    setLoading(true);
    try {
      const result = await recordAdHocMaterialUsage({
        productionOrderId: order.id,
        productVariantId: selectedVariantId,
        locationId: selectedLocationId || defaultLocationId,
        quantity,
        reason: reason ? sanitizeHtml(reason) : undefined,
        requestId,
      });

      if (result.success) {
        const unit = selectedVariant?.primaryUnit || "";
        toast.success(
          `${selectedVariant?.name || "Bahan"} −${quantity.toFixed(1).replace(".", ",")} ${unit.toUpperCase()} dari ${
            locations.find((l) => l.id === (selectedLocationId || defaultLocationId))?.name || ""
          } · tercatat di ${order.orderNumber}`
        );
        handleOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error || "Gagal mencatat pemakaian bahan.");
      }
    } catch {
      toast.error("Gagal mencatat pemakaian bahan. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-1" />
          {productionComponentLabels.recordAdHocUsage}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {productionComponentLabels.recordAdHocUsage}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Help text */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
            {productionComponentLabels.adHocUsageHelp}
          </div>

          {/* Material select */}
          <div className="space-y-2">
            <Label>{productionComponentLabels.adHocMaterial}</Label>
            <Select
              value={selectedVariantId}
              onValueChange={setSelectedVariantId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={productionComponentLabels.selectAdHocMaterial}
                />
              </SelectTrigger>
              <SelectContent>
                {rawMaterials.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                    {m.skuCode ? ` (${m.skuCode})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity + unit */}
          <div className="space-y-2">
            <Label>{productionComponentLabels.quantity}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0"
                value={quantity || ""}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
              <span className="text-sm text-muted-foreground font-medium w-10">
                {selectedVariant?.primaryUnit || "-"}
              </span>
            </div>
          </div>

          {/* Source location */}
          <div className="space-y-2">
            <Label>{productionComponentLabels.sourceLocation}</Label>
            <Select
              value={selectedLocationId || defaultLocationId}
              onValueChange={setSelectedLocationId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reason (optional) */}
          <div className="space-y-2">
            <Label>{productionComponentLabels.adHocReason}</Label>
            <Textarea
              placeholder={productionComponentLabels.adHocReasonPlaceholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            {productionComponentLabels.cancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedVariantId || quantity <= 0}
          >
            {loading
              ? productionComponentLabels.recording
              : productionComponentLabels.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
