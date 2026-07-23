"use client";

import { Button } from "@/components/ui/button";
import { FormLabel } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { stageLabelId, recommendedOutputHint, type ProductionStage } from "@/lib/locations/resolve-location";
import { parseLocalDate, formatLocalDate } from "@/lib/dates/parse-local-date";
import Link from "next/link";

interface BomOption {
  id: string;
  name: string;
  isDefault: boolean;
  productVariantId: string;
  category: string;
  outputQuantity: number;
  productVariant: Record<string, unknown>;
}

interface MachineOption {
  id: string;
  name: string;
  type: string;
}

interface ProductOption {
  id: string;
  name: string;
}

interface StageProductSectionProps {
  stage: ProductionStage;
  onStageChange: (stage: ProductionStage) => void;
  products: ProductOption[];
  selectedProductId: string;
  onProductChange: (id: string) => void;
  boms: BomOption[];
  selectedBomId: string;
  onBomChange: (id: string) => void;
  selectedBom: BomOption | undefined;
  machines: MachineOption[];
  selectedMachineId: string;
  onMachineChange: (id: string) => void;
  plannedStartDate: Date;
  onDateChange: (date: Date) => void;
  plannedEndDate?: Date;
  onEndDateChange?: (date: Date | undefined) => void;
}

export function StageProductSection({
  stage,
  onStageChange,
  products,
  selectedProductId,
  onProductChange,
  boms,
  selectedBomId,
  onBomChange,
  selectedBom,
  machines,
  selectedMachineId,
  onMachineChange,
  plannedStartDate,
  onDateChange,
  plannedEndDate,
  onEndDateChange,
}: StageProductSectionProps) {
  return (
    <div className="space-y-6">
      {/* Stage selector */}
      <div className="space-y-3">
        <FormLabel>Stage Produksi</FormLabel>
        <div className="flex rounded-md shadow-sm" role="group" aria-label="Stage produksi">
          {(["mixing", "extrusion", "packing", "rework"] as ProductionStage[]).map((s, i) => (
            <Button
              key={s}
              type="button"
              variant={stage === s ? "default" : "outline"}
              className={`${i === 0 ? "rounded-r-none" : i === 3 ? "rounded-l-none" : "rounded-none"} h-9 flex-1 text-xs ${i > 0 ? "border-l-0" : ""}`}
              onClick={() => onStageChange(s)}
              aria-pressed={stage === s}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Stage: <span className="font-medium text-foreground">{stageLabelId(stage)}</span>
          {" · "}
          Default output: {recommendedOutputHint(stage)}
        </p>
      </div>

      {/* Product + BOM */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <FormLabel>Produk</FormLabel>
          <Select value={selectedProductId} onValueChange={onProductChange}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih produk" />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {products.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Tidak ada produk untuk stage ini.{" "}
              <Link href="/production/boms" className="text-primary underline">
                Buat BOM dulu
              </Link>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <FormLabel>Resep / BOM</FormLabel>
          <Select
            value={selectedBomId}
            onValueChange={onBomChange}
            disabled={!selectedProductId}
          >
            <SelectTrigger>
              <SelectValue placeholder={!selectedProductId ? "Pilih produk dulu" : "Pilih resep"} />
            </SelectTrigger>
            <SelectContent>
              {boms.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name} {b.isDefault ? "(Default)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBom && (
            <p className="text-xs text-muted-foreground">
              Output: {selectedBom.outputQuantity}{" "}
              {(selectedBom.productVariant as Record<string, unknown>)?.primaryUnit as string || ""} / batch
            </p>
          )}
        </div>
      </div>

      {/* Machine + Date */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <FormLabel>Mesin / Work Center</FormLabel>
          <Select value={selectedMachineId} onValueChange={onMachineChange}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih mesin" />
            </SelectTrigger>
            <SelectContent>
              {machines.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {machines.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Tidak ada mesin cocok; SPK tetap bisa tanpa mesin.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <FormLabel>Tanggal Mulai</FormLabel>
          <Input
            type="date"
            value={formatLocalDate(plannedStartDate)}
            onChange={(e) => onDateChange(parseLocalDate(e.target.value))}
          />
        </div>

        {onEndDateChange && (
          <div className="space-y-2">
            <FormLabel>Tanggal Selesai (opsional)</FormLabel>
            <Input
              type="date"
              value={plannedEndDate ? formatLocalDate(plannedEndDate) : ""}
              onChange={(e) =>
                onEndDateChange(
                  e.target.value ? parseLocalDate(e.target.value) : undefined,
                )
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
