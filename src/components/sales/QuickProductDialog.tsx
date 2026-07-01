"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { createProduct } from "@/actions/product/product-mutations";
import { getProductVariants } from "@/actions/inventory/inventory";
import { toast } from "sonner";
import type { SerializedProductVariant } from "./sales-order-types";

interface QuickProductDialogProps {
  onProductCreated: (variant: SerializedProductVariant) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

function generateSkuFromName(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  let sku = words.map((w) => w[0]).join("");
  if (sku.length < 3) {
    sku = words.join("").slice(0, 5);
  }
  return sku.slice(0, 8).padEnd(5, "0");
}

export function QuickProductDialog({
  onProductCreated,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: QuickProductDialogProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : localOpen;
  const setOpen = controlledOnOpenChange !== undefined ? controlledOnOpenChange : setLocalOpen;
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [productType, setProductType] = useState("FINISHED_GOOD");

  const generatedSku = name ? generateSkuFromName(name) : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      const result = await createProduct({
        name: name.trim(),
        productType: productType as
          | "FINISHED_GOOD"
          | "RAW_MATERIAL"
          | "SCRAP"
          | "PACKAGING"
          | "AUXILIARY"
          | "SERVICE",
        variants: [
          {
            name: name.trim(),
            skuCode: generatedSku,
            primaryUnit: "KG",
            salesUnit: "KG",
            conversionFactor: 1,
            price: sellPrice ? Number(sellPrice) : null,
          },
        ],
      });

      if (result.success) {
        // Fetch the newly created product by SKU to get its ID
        const productsRes = await getProductVariants();
        if (productsRes.success && productsRes.data) {
          const newVariant = productsRes.data.find(
            (p) => p.skuCode === generatedSku,
          );
          if (newVariant) {
            const serialized: SerializedProductVariant = {
              ...newVariant,
              price: newVariant.price ? Number(newVariant.price) : null,
              buyPrice: newVariant.buyPrice
                ? Number(newVariant.buyPrice)
                : null,
              sellPrice: newVariant.sellPrice
                ? Number(newVariant.sellPrice)
                : null,
              conversionFactor: Number(newVariant.conversionFactor),
              minStockAlert: newVariant.minStockAlert
                ? Number(newVariant.minStockAlert)
                : null,
              reorderPoint: newVariant.reorderPoint
                ? Number(newVariant.reorderPoint)
                : null,
              reorderQuantity: newVariant.reorderQuantity
                ? Number(newVariant.reorderQuantity)
                : null,
              standardCost: newVariant.standardCost
                ? Number(newVariant.standardCost)
                : null,
              inventories:
                newVariant.inventories?.map((inv) => ({
                  locationId: inv.locationId,
                  quantity: Number(inv.quantity),
                })) || [],
              customerPrices:
                newVariant.customerPrices?.map((cp) => ({
                  customerId: cp.customerId,
                  unitPrice: Number(cp.unitPrice),
                  isActive: cp.isActive,
                })) || [],
            };
            toast.success("Produk berhasil dibuat & dipilih");
            setOpen(false);
            setName("");
            setSellPrice("");
            setProductType("FINISHED_GOOD");
            onProductCreated(serialized);
          } else {
            toast.success("Produk dibuat. Silakan cari di daftar produk.");
            setOpen(false);
            setName("");
            setSellPrice("");
            setProductType("FINISHED_GOOD");
          }
        }
      } else {
        toast.error(result.error || "Gagal membuat produk");
      }
    } catch {
      toast.error("Gagal menyimpan produk. Silakan coba lagi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Produk Cepat</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-product-name">Nama Produk *</Label>
            <Input
              id="quick-product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Plastik OPP 8 micron"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Tipe Produk</Label>
            <Select value={productType} onValueChange={setProductType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FINISHED_GOOD">Finished Good</SelectItem>
                <SelectItem value="PACKAGING">Packaging</SelectItem>
                <SelectItem value="AUXILIARY">Bahan Penolong</SelectItem>
                <SelectItem value="SCRAP">Scrap</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-product-price">Harga Jual (Rp)</Label>
            <Input
              id="quick-product-price"
              type="number"
              min="0"
              step="100"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="0"
            />
          </div>

          {generatedSku && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <span className="text-muted-foreground">SKU otomatis: </span>
              <span className="font-mono font-medium">{generatedSku}</span>
              <span className="text-muted-foreground"> • Unit: KG</span>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Batal
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Simpan & Pilih
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
