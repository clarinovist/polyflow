"use client";

import React, { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2, Factory } from "lucide-react";
import { createSpkFromDemand } from "@/actions/production/production";

type Machine = {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
};

type Location = {
  id: string;
  name: string;
  slug?: string;
  locationPurpose?: string;
};

interface CreateSpkFromDemandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productVariantId: string;
  productName: string;
  variantName: string;
  skuCode: string;
  unit: string;
  /** Default qty hint (uncoveredNeed) */
  defaultQuantity: number;
  machines: Machine[];
  locations: Location[];
  onCreated?: () => void;
}

export function CreateSpkFromDemandDialog({
  open,
  onOpenChange,
  productVariantId,
  productName,
  variantName,
  skuCode,
  unit,
  defaultQuantity,
  machines,
  locations,
  onCreated,
}: CreateSpkFromDemandDialogProps) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [priority, setPriority] = useState<"URGENT" | "NORMAL" | "LOW">("NORMAL");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter locations to FG/production relevant ones
  const fgLocations = useMemo(() => {
    return locations.filter(
      (l) =>
        l.locationPurpose === "FINISHED_GOOD" ||
        l.locationPurpose === "GENERAL_PURPOSE" ||
        l.locationPurpose === "WIP",
    );
  }, [locations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const qty = parseFloat(quantity) || defaultQuantity;
    if (qty <= 0) {
      toast.error("Jumlah harus lebih dari 0");
      return;
    }
    if (!selectedLocationId) {
      toast.error("Pilih lokasi output");
      return;
    }

    setIsSubmitting(true);
    try {
      const machineId =
        !selectedMachineId || selectedMachineId === "__none"
          ? undefined
          : selectedMachineId;

      const result = await createSpkFromDemand({
        productVariantId,
        plannedQuantity: qty,
        machineId,
        locationId: selectedLocationId,
        priority,
        notes: `Dari Papan Permintaan FG — ${productName} ${variantName}`,
      });

      if (result.success) {
        toast.success(`SPK berhasil dibuat untuk ${productName} ${variantName}`);
        onOpenChange(false);
        router.refresh();
        onCreated?.();
        // Reset
        setQuantity("");
        setSelectedMachineId("");
        setSelectedLocationId("");
        setPriority("NORMAL");
      } else {
        toast.error(result.error || "Gagal membuat SPK");
      }
    } catch {
      toast.error("Gagal membuat SPK. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Buat SPK dari Papan Permintaan
          </DialogTitle>
          <DialogDescription>
            {productName} — {variantName} ({skuCode})
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">
              Jumlah ({unit})
            </Label>
            <Input
              id="quantity"
              type="number"
              placeholder={defaultQuantity.toString()}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              min="0"
              step="any"
            />
            <p className="text-xs text-muted-foreground">
              Belum di-SPK: {defaultQuantity.toLocaleString("id-ID")} {unit}
            </p>
          </div>

          {/* Machine selection (optional) */}
          <div className="space-y-2">
            <Label htmlFor="machine">Mesin (opsional)</Label>
            <Select
              value={selectedMachineId}
              onValueChange={setSelectedMachineId}
            >
              <SelectTrigger id="machine">
                <SelectValue placeholder="Pilih mesin..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Tanpa Mesin</SelectItem>
                {machines
                  .filter((m) => m.status === "ACTIVE")
                  .map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{machine.code}</span>
                        <span className="text-xs text-muted-foreground">
                          {machine.name}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="location">Lokasi Output</Label>
            <Select
              value={selectedLocationId}
              onValueChange={setSelectedLocationId}
            >
              <SelectTrigger id="location">
                <SelectValue placeholder="Pilih lokasi..." />
              </SelectTrigger>
              <SelectContent>
                {fgLocations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
                {fgLocations.length === 0 &&
                  locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Prioritas</Label>
            <Select
              value={priority}
              onValueChange={(v) =>
                setPriority(v as "URGENT" | "NORMAL" | "LOW")
              }
            >
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="URGENT">🔴 URGENT</SelectItem>
                <SelectItem value="NORMAL">🟡 NORMAL</SelectItem>
                <SelectItem value="LOW">🟢 LOW</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedLocationId}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Membuat...
                </>
              ) : (
                "Buat SPK"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
