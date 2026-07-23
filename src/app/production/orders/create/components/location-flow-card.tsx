"use client";

import { Badge } from "@/components/ui/badge";
import { FormLabel } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils/utils";
import { stageLabelId, type ProductionStage, type LocationLike } from "@/lib/locations/resolve-location";

interface LocationFlowCardProps {
  stage: ProductionStage;
  sourceLocationName: string;
  outputLocationId: string;
  onOutputLocationChange: (id: string) => void;
  activeLocations: LocationLike[];
  recommendedOutputId: string;
  recommendedOutputName: string;
  outputIsRisky: boolean;
  outputIsRecommended: boolean;
  outputManuallyOverridden: boolean;
  onResetToDefault: () => void;
}

export function LocationFlowCard({
  stage,
  sourceLocationName,
  outputLocationId,
  onOutputLocationChange,
  activeLocations,
  recommendedOutputId,
  recommendedOutputName,
  outputIsRisky,
  outputIsRecommended,
  outputManuallyOverridden,
  onResetToDefault,
}: LocationFlowCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3",
        outputIsRisky
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Alur material</h3>
        {outputIsRecommended ? (
          <Badge variant="secondary" className="text-[10px]">
            Disarankan
          </Badge>
        ) : outputManuallyOverridden && recommendedOutputId ? (
          <Badge variant="outline" className="text-[10px]">
            Diubah manual
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Asal bahan (cek stok)
          </Label>
          <div className="flex h-10 items-center rounded-md border bg-background px-3 text-sm">
            {sourceLocationName}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Dipakai untuk cek ketersediaan material. Bukan tujuan transfer staging.
          </p>
        </div>
        <div className="hidden sm:flex items-center justify-center pb-6 text-muted-foreground">
          <ArrowRightLeft className="h-4 w-4" />
        </div>
        <div className="space-y-1.5">
          <FormLabel className="text-xs">
            Output / staging (lokasi SPK)
          </FormLabel>
          <Select
            value={outputLocationId || ""}
            onValueChange={onOutputLocationChange}
          >
            <SelectTrigger
              className={cn(
                outputIsRisky &&
                  "border-destructive text-destructive focus:ring-destructive",
              )}
            >
              <SelectValue placeholder="Pilih lokasi output" />
            </SelectTrigger>
            <SelectContent>
              {activeLocations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                  {l.id === recommendedOutputId ? " · disarankan" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">
            Default stage {stageLabelId(stage)}:{" "}
            <span className="font-medium text-foreground">
              {recommendedOutputName}
            </span>
            {!outputIsRecommended && recommendedOutputId && (
              <>
                {" · "}
                <button
                  type="button"
                  className="underline underline-offset-2 text-primary"
                  onClick={onResetToDefault}
                >
                  Kembalikan ke default
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {outputIsRisky && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Lokasi output ini gudang bahan baku atau nonaktif.
            Transfer material staging akan gagal (asal = tujuan) dan
            backflush bisa salah. Pilih WIP / FG / packing area.
          </span>
        </div>
      )}
    </div>
  );
}
