"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import {
  ClipboardCheck,
  Factory,
  Search,
  Package,
} from "lucide-react";
import { CreateSpkFromDemandDialog } from "./CreateSpkFromDemandDialog";

interface FgDemandRow {
  productVariantId: string;
  productName: string;
  variantName: string;
  skuCode: string;
  unit: string;
  openDemand: number;
  availableFg: number;
  needToMake: number;
  openSpkPlanned: number;
  uncoveredNeed: number;
  earliestDue: string | null;
  urgencyHint: "URGENT" | "NORMAL" | "LOW";
  openSpkCount: number;
  openSpkTotalQty: number;
}

interface Machine {
  id: string;
  name: string;
  code: string;
  type: string;
  status: string;
}

interface Location {
  id: string;
  name: string;
  slug?: string;
  locationPurpose?: string;
}

interface ProductionRequestsClientProps {
  rows: FgDemandRow[];
  machines: Machine[];
  locations: Location[];
}

const urgencyBadge = (urgency: string) => {
  switch (urgency) {
    case "URGENT":
      return (
        <Badge variant="destructive" className="text-[10px] py-0 h-5">
          🔴 Urgent
        </Badge>
      );
    case "NORMAL":
      return (
        <Badge
          variant="outline"
          className="bg-warning/10 text-warning border-warning/20 text-[10px] py-0 h-5"
        >
          🟡 Normal
        </Badge>
      );
    case "LOW":
      return (
        <Badge
          variant="outline"
          className="bg-muted text-muted-foreground text-[10px] py-0 h-5"
        >
          🟢 Low
        </Badge>
      );
    default:
      return null;
  }
};

export function ProductionRequestsClient({
  rows,
  machines,
  locations,
}: ProductionRequestsClientProps) {
  const [search, setSearch] = useState("");
  const [onlyUncovered, setOnlyUncovered] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<FgDemandRow | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (onlyUncovered && row.uncoveredNeed <= 0) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          row.productName.toLowerCase().includes(q) ||
          row.variantName.toLowerCase().includes(q) ||
          row.skuCode.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, search, onlyUncovered]);

  const handleCreateSpk = (row: FgDemandRow) => {
    setSelectedRow(row);
    setDialogOpen(true);
  };

  const totalNeed = filtered.reduce((sum, r) => sum + r.needToMake, 0);
  const totalUncovered = filtered.reduce(
    (sum, r) => sum + r.uncoveredNeed,
    0,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Papan Permintaan FG
          </CardTitle>
          <CardDescription>
            Item FG yang perlu diproduksi berdasarkan Sales Order aktif.
            Kurangi stok FG dan SPK yang sudah ada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari produk / SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="only-uncovered"
                checked={onlyUncovered}
                onCheckedChange={setOnlyUncovered}
              />
              <Label
                htmlFor="only-uncovered"
                className="text-sm cursor-pointer"
              >
                Belum di-SPK saja
              </Label>
            </div>

            <div className="flex items-center gap-4 ml-auto text-sm text-muted-foreground">
              <span>
                Perlu dibuat:{" "}
                <strong className="text-foreground">
                  {totalNeed.toLocaleString("id-ID")}
                </strong>
              </span>
              <span>
                Belum di-SPK:{" "}
                <strong className="text-foreground">
                  {totalUncovered.toLocaleString("id-ID")}
                </strong>
              </span>
              <span>
                {filtered.length} item{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Tidak ada permintaan FG</p>
              <p className="text-sm">
                {rows.length === 0
                  ? "Semua Sales Order sudah terpenuhi atau belum ada SO aktif."
                  : "Tidak ada item yang cocok dengan filter."}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Perlu (net stok)</TableHead>
                    <TableHead className="text-right">Belum di-SPK</TableHead>
                    <TableHead className="text-right">Stok FG</TableHead>
                    <TableHead className="text-right">SPK open</TableHead>
                    <TableHead>Due Terdekat</TableHead>
                    <TableHead>Sinyal</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.productVariantId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {row.productName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {row.variantName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {row.skuCode}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {row.needToMake.toLocaleString("id-ID")} {row.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={
                            row.uncoveredNeed > 0
                              ? "font-semibold text-foreground"
                              : "text-muted-foreground"
                          }
                        >
                          {row.uncoveredNeed.toLocaleString("id-ID")} {row.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {row.availableFg.toLocaleString("id-ID")} {row.unit}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {row.openSpkCount > 0 ? (
                          <span>
                            {row.openSpkCount} ·{" "}
                            {row.openSpkTotalQty.toLocaleString("id-ID")}{" "}
                            {row.unit}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {row.earliestDue ? (
                          format(new Date(row.earliestDue), "dd MMM yyyy", {
                            locale: idLocale,
                          })
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{urgencyBadge(row.urgencyHint)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleCreateSpk(row)}
                          disabled={row.uncoveredNeed <= 0}
                        >
                          <Factory className="mr-1 h-3 w-3" />
                          Buat SPK
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedRow && (
        <CreateSpkFromDemandDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          productVariantId={selectedRow.productVariantId}
          productName={selectedRow.productName}
          variantName={selectedRow.variantName}
          skuCode={selectedRow.skuCode}
          unit={selectedRow.unit}
          defaultQuantity={selectedRow.uncoveredNeed}
          machines={machines}
          locations={locations}
        />
      )}
    </div>
  );
}
