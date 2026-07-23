"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/utils";

interface ReviewCommitSectionProps {
  stage: string;
  productName: string;
  bomName: string;
  targetSummary: string;
  machineName: string;
  startDate: string;
  endDate?: string;
  sourceName: string;
  outputName: string;
  priority: string;
  isMaklon: boolean;
  salesOrderNumber?: string;
  predictedStatus: "DRAFT" | "MENUNGGU_BAHAN";
  outputIsRisky: boolean;
  isSubmitting: boolean;
  isCalculating: boolean;
  isFormValid: boolean;
}

export function ReviewCommitSection({
  stage,
  productName,
  bomName,
  targetSummary,
  machineName,
  startDate,
  endDate,
  sourceName,
  outputName,
  priority,
  isMaklon,
  salesOrderNumber,
  predictedStatus,
  outputIsRisky,
  isSubmitting,
  isCalculating,
  isFormValid,
}: ReviewCommitSectionProps) {
  const canSubmit = isFormValid && !isCalculating;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ringkasan SPK</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Stage</span>
          <span className="font-medium">{stage}</span>

          <span className="text-muted-foreground">Produk</span>
          <span className="font-medium">{productName || "—"}</span>

          <span className="text-muted-foreground">Resep</span>
          <span className="font-medium">{bomName || "—"}</span>

          <span className="text-muted-foreground">Target</span>
          <span className="font-medium">{targetSummary}</span>

          <span className="text-muted-foreground">Mesin</span>
          <span className="font-medium">{machineName || "Tidak ditentukan"}</span>

          <span className="text-muted-foreground">Mulai</span>
          <span className="font-medium">{startDate}</span>

          {endDate && (
            <>
              <span className="text-muted-foreground">Selesai</span>
              <span className="font-medium">{endDate}</span>
            </>
          )}

          <span className="text-muted-foreground">Alur material</span>
          <span className="font-medium">{sourceName} → {outputName}</span>

          <span className="text-muted-foreground">Prioritas</span>
          <span className="font-medium">{priority}</span>

          <span className="text-muted-foreground">Maklon</span>
          <span className="font-medium">{isMaklon ? "Ya" : "Tidak"}</span>

          {salesOrderNumber && (
            <>
              <span className="text-muted-foreground">Sales Order</span>
              <span className="font-medium">{salesOrderNumber}</span>
            </>
          )}
        </div>

        <div className="pt-3 border-t">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status prediksi:</span>
            <span
              className={cn(
                "font-semibold text-sm px-2 py-0.5 rounded",
                predictedStatus === "DRAFT"
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
              )}
            >
              {predictedStatus === "DRAFT" ? "DRAFT" : "Menunggu Bahan"}
            </span>
          </div>
        </div>

        {outputIsRisky && (
          <div className="pt-3 border-t">
            <p className="text-xs text-destructive">
              ⚠ Lokasi output berisiko. Konfirmasi diperlukan saat submit.
            </p>
          </div>
        )}

        {/* Submit CTA */}
        <div className="pt-3 border-t flex flex-col gap-2">
          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || isSubmitting}
            className="w-full"
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Buat SPK
          </Button>
          {isCalculating && (
            <p className="text-xs text-muted-foreground text-center">
              Menghitung kebutuhan bahan...
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
