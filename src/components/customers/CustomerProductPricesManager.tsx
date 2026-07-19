"use client";

import { useMemo, useState } from "react";
import type { Product, ProductVariant } from "@prisma/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/utils/utils";
import {
  deactivateCustomerProductPrice,
  upsertCustomerProductPrice,
} from "@/actions/sales/customer-product-prices";
import { Loader2, Save, Download, Upload } from "lucide-react";

type SerializedProductVariant = Omit<
  ProductVariant,
  | "price"
  | "buyPrice"
  | "sellPrice"
  | "conversionFactor"
  | "minStockAlert"
  | "reorderPoint"
  | "reorderQuantity"
  | "standardCost"
> & {
  price: number | null;
  buyPrice: number | null;
  sellPrice: number | null;
  conversionFactor: number;
  minStockAlert: number | null;
  reorderPoint: number | null;
  reorderQuantity: number | null;
  standardCost: number | null;
  product: Product;
};

type SerializedCustomerProductPrice = {
  id: string;
  customerId: string;
  productVariantId: string;
  unitPrice: number;
  isActive: boolean;
  notes: string | null;
  productVariant: SerializedProductVariant;
};

interface Props {
  customerId: string;
  prices: SerializedCustomerProductPrice[];
  products: SerializedProductVariant[];
}

function productLabel(product: SerializedProductVariant) {
  return product.product.name === product.name
    ? product.name
    : `${product.product.name} - ${product.name}`;
}

export function CustomerProductPricesManager({
  customerId,
  prices,
  products,
}: Props) {
  const [selectedProductVariantId, setSelectedProductVariantId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const priceMap = useMemo(
    () => new Map(prices.map((price) => [price.productVariantId, price])),
    [prices],
  );

  const selectedProduct = products.find(
    (product) => product.id === selectedProductVariantId,
  );

  async function handleSave() {
    if (!selectedProductVariantId) {
      toast.error("Pilih produk dulu");
      return;
    }

    const parsedPrice = Number(unitPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error("Harga tidak valid");
      return;
    }

    setPendingKey("new");
    const result = await upsertCustomerProductPrice({
      customerId,
      productVariantId: selectedProductVariantId,
      unitPrice: parsedPrice,
      isActive: true,
      notes,
    });
    setPendingKey(null);

    if (result.success) {
      toast.success("Harga customer disimpan");
      setSelectedProductVariantId("");
      setUnitPrice("");
      setNotes("");
    } else {
      toast.error(result.error || "Gagal menyimpan harga customer");
    }
  }

  async function handleDeactivate(productVariantId: string) {
    setPendingKey(productVariantId);
    const result = await deactivateCustomerProductPrice({
      customerId,
      productVariantId,
    });
    setPendingKey(null);

    if (result.success) {
      toast.success("Harga customer dinonaktifkan");
    } else {
      toast.error(result.error || "Gagal menonaktifkan harga");
    }
  }

  function startEdit(price: SerializedCustomerProductPrice) {
    setSelectedProductVariantId(price.productVariantId);
    setUnitPrice(String(price.unitPrice));
    setNotes(price.notes || "");
  }

  function handleExportCSV() {
    const headers = ["SKU", "Nama Produk", "Harga Customer", "Catatan"];
    const rows = prices
      .filter((p) => p.isActive)
      .map((p) => [
        p.productVariant.skuCode,
        productLabel(p.productVariant),
        String(p.unitPrice),
        p.notes || "",
      ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `harga-customer-${customerId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV berhasil diunduh");
  }

  async function handleImportCSV(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) {
      toast.error("CSV kosong atau hanya berisi header");
      return;
    }

    const header = lines[0].toLowerCase();
    if (!header.includes("sku") || !header.includes("harga")) {
      toast.error("Format CSV tidak valid. Header harus: SKU, Nama Produk, Harga Customer, Catatan");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",").map((c) => c.replace(/^"|"$/g, "").replace('""', '"').trim());
      const sku = cols[0];
      const priceStr = cols[2];
      const note = cols[3] || "";

      if (!sku || !priceStr) {
        errorCount++;
        continue;
      }

      const parsedPrice = Number(priceStr);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        errorCount++;
        continue;
      }

      const product = products.find((p) => p.skuCode === sku);
      if (!product) {
        errorCount++;
        continue;
      }

      const result = await upsertCustomerProductPrice({
        customerId,
        productVariantId: product.id,
        unitPrice: parsedPrice,
        isActive: true,
        notes: note || undefined,
      });

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    event.target.value = "";
    if (successCount > 0) {
      toast.success(`${successCount} harga berhasil diimpor${errorCount > 0 ? `, ${errorCount} gagal` : ""}`);
    } else {
      toast.error(`Semua ${errorCount} baris gagal diimpor. Periksa SKU dan format harga.`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-2">
            <label className="text-sm font-medium">Produk</label>
            <Select
              value={selectedProductVariantId}
              onValueChange={(value) => {
                setSelectedProductVariantId(value);
                const existing = priceMap.get(value);
                const product = products.find((item) => item.id === value);
                setUnitPrice(
                  existing
                    ? String(existing.unitPrice)
                    : String(product?.sellPrice ?? product?.price ?? ""),
                );
                setNotes(existing?.notes || "");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih produk" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {productLabel(product)} ({product.skuCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProduct && (
              <p className="text-xs text-muted-foreground">
                Harga default: {formatRupiah(selectedProduct.sellPrice ?? selectedProduct.price ?? 0)}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Harga Customer</label>
            <Input
              type="number"
              min={0}
              step="100"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              placeholder="93800"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Catatan</label>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opsional, misalnya harga deal khusus / sumber data"
            rows={2}
          />
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={handleSave} disabled={pendingKey === "new"}>
            {pendingKey === "new" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Simpan Harga
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Daftar Harga Khusus</h3>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleExportCSV}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-md cursor-pointer hover:bg-muted/50 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            Import CSV
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCSV}
            />
          </label>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Harga Default</TableHead>
              <TableHead className="text-right">Harga Customer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Belum ada harga khusus untuk customer ini.
                </TableCell>
              </TableRow>
            ) : (
              prices.map((price) => (
                <TableRow key={price.id}>
                  <TableCell className="font-medium">
                    {productLabel(price.productVariant)}
                    {price.notes && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {price.notes}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {price.productVariant.skuCode}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatRupiah(price.productVariant.sellPrice ?? price.productVariant.price ?? 0)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatRupiah(price.unitPrice)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={price.isActive ? "default" : "secondary"}>
                      {price.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => startEdit(price)}
                    >
                      Edit
                    </Button>
                    {price.isActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pendingKey === price.productVariantId}
                        onClick={() => handleDeactivate(price.productVariantId)}
                      >
                        {pendingKey === price.productVariantId ? "..." : "Nonaktifkan"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
