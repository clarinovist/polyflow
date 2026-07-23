"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle, Plus, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MaterialRequirement } from "../hooks/use-bom-material-preview";

interface RawMaterial {
  id: string;
  name: string;
  primaryUnit: string;
}

interface MaterialPreviewPanelProps {
  sourceLocationName: string;
  items: { productVariantId: string; quantity: number }[];
  materialInfo: Record<string, Omit<MaterialRequirement, "requiredQty">>;
  suggestedSource: { id: string; name: string } | null;
  isCalculating: boolean;
  hasStockIssues: boolean;
  onAcceptSuggestedSource: () => void;
  /** C1: Editable mode — enables qty editing and add/remove lines */
  editable?: boolean;
  /** C1: Available raw materials for "add line" dropdown */
  rawMaterials?: RawMaterial[];
  /** C1: Called when user changes a quantity */
  onItemQtyChange?: (productVariantId: string, newQty: number) => void;
  /** C1: Called when user adds a new material line */
  onAddItem?: (productVariantId: string, qty: number) => void;
  /** C1: Called when user removes a material line */
  onRemoveItem?: (productVariantId: string) => void;
}

export function MaterialPreviewPanel({
  sourceLocationName,
  items,
  materialInfo,
  suggestedSource,
  isCalculating,
  hasStockIssues,
  onAcceptSuggestedSource,
  editable = false,
  rawMaterials = [],
  onItemQtyChange,
  onAddItem,
  onRemoveItem,
}: MaterialPreviewPanelProps) {
  const [addVariantId, setAddVariantId] = useState("");
  const [addQty, setAddQty] = useState(0);

  const existingIds = new Set(items.map((i) => i.productVariantId));
  const availableToAdd = rawMaterials.filter((rm) => !existingIds.has(rm.id));

  const handleAdd = () => {
    if (addVariantId && addQty > 0 && onAddItem) {
      onAddItem(addVariantId, addQty);
      setAddVariantId("");
      setAddQty(0);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Kebutuhan Bahan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Sumber: {sourceLocationName || "—"}
        </div>

        {suggestedSource && (
          <Alert className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-sm">
              Stok ditemukan di gudang lain
            </AlertTitle>
            <AlertDescription className="text-xs flex items-center justify-between gap-3">
              <span>
                Terdeteksi stok di{" "}
                <span className="font-medium">{suggestedSource.name}</span>.
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={onAcceptSuggestedSource}
              >
                Pakai gudang ini
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {hasStockIssues && (
          <Alert
            variant="default"
            className="py-2 border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-900/20"
          >
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm text-amber-800 dark:text-amber-400">
              Kekurangan bahan
            </AlertTitle>
            <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
              SPK akan berstatus <b>Menunggu Bahan</b>.
            </AlertDescription>
          </Alert>
        )}

        <div className="border rounded-md overflow-hidden max-h-[75vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-xs">Item</TableHead>
                <TableHead className="h-8 text-xs w-[100px] text-right">
                  Kebutuhan
                </TableHead>
                <TableHead className="h-8 text-xs w-[70px] text-right">
                  Stok
                </TableHead>
                {editable && (
                  <TableHead className="h-8 text-xs w-[40px]" />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 && !isCalculating && (
                <TableRow>
                  <TableCell
                    colSpan={editable ? 4 : 3}
                    className="text-center text-slate-400 dark:text-slate-300 py-8 text-xs"
                  >
                    Pilih produk & target dulu
                  </TableCell>
                </TableRow>
              )}

              {isCalculating && (
                <TableRow>
                  <TableCell colSpan={editable ? 4 : 3} className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400 dark:text-slate-300" />
                  </TableCell>
                </TableRow>
              )}

              {items.map((item) => {
                const info = materialInfo[item.productVariantId];
                // BOM-sourced items have stock data; ad-hoc (from rawMaterials meta) have stdQty=0
                const isBomSourced = info && info.stdQty > 0;
                const isLowStock = isBomSourced && info && item.quantity > info.currentStock;

                return (
                  <TableRow key={item.productVariantId}>
                    <TableCell className="py-2">
                      <div className="font-medium text-xs">
                        {info?.name || "Unknown"}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      {editable && onItemQtyChange ? (
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          className="h-7 text-xs text-right"
                          value={item.quantity}
                          onChange={(e) =>
                            onItemQtyChange(
                              item.productVariantId,
                              Number(e.target.value) || 0,
                            )
                          }
                        />
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs font-semibold">
                            {Number(item.quantity).toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-400 dark:text-slate-300">
                            {info?.unit}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-2 text-right">
                      <div className="flex flex-col items-end">
                        {isBomSourced ? (
                          <>
                            <span
                              className={`text-xs ${isLowStock ? "text-red-600 dark:text-red-400 font-bold" : ""}`}
                            >
                              {info?.currentStock ?? 0}
                            </span>
                            {isLowStock && (
                              <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">
                                Kurang
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-300">—</span>
                        )}
                      </div>
                    </TableCell>
                    {editable && onRemoveItem && (
                      <TableCell className="py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveItem(item.productVariantId)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* C1: Add material line */}
        {editable && availableToAdd.length > 0 && (
          <div className="flex items-end gap-2 pt-2 border-t">
            <div className="flex-1 space-y-1">
              <span className="text-[10px] text-muted-foreground">Tambah bahan</span>
              <Select value={addVariantId} onValueChange={setAddVariantId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Pilih bahan" />
                </SelectTrigger>
                <SelectContent>
                  {availableToAdd.map((rm) => (
                    <SelectItem key={rm.id} value={rm.id}>
                      {rm.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-24 space-y-1">
              <span className="text-[10px] text-muted-foreground">Qty</span>
              <Input
                type="number"
                step="0.01"
                min={0}
                className="h-8 text-xs"
                value={addQty || ""}
                onChange={(e) => setAddQty(Number(e.target.value) || 0)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-2"
              disabled={!addVariantId || addQty <= 0}
              onClick={handleAdd}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
