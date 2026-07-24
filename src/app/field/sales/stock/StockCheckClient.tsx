"use client";

import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Package, AlertTriangle, ScanLine } from "lucide-react";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { toast } from "sonner";

type Product = {
  id: string;
  name: string;
  productName: string;
  skuCode: string;
  primaryUnit: string;
  sellPrice: number | null;
  inventories: { locationId: string; quantity: number }[];
};

type Location = { id: string; name: string };

interface StockCheckClientProps {
  products: Product[];
  locations: Location[];
}

export function StockCheckClient({
  products,
  locations,
}: StockCheckClientProps) {
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.productName.toLowerCase().includes(q) ||
        p.skuCode.toLowerCase().includes(q),
    );
  }, [products, search]);

  const handleScanned = useCallback(
    (value: string) => {
      setSearch(value);
      setScannerOpen(false);
      const found = products.some(
        (p) => p.skuCode.toLowerCase() === value.toLowerCase(),
      );
      if (!found) {
        toast.info("Barcode dipindai, tapi produk tidak ditemukan di daftar");
      }
    },
    [products],
  );

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Cek Stok</h1>
        <p className="text-sm text-muted-foreground">
          {products.length} produk tersedia
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari nama atau SKU produk..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-11"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => setScannerOpen(true)}
          aria-label="Scan barcode"
        >
          <ScanLine className="h-5 w-5" />
        </Button>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleScanned}
      />

      {/* Product List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {search ? "Produk tidak ditemukan" : "Belum ada produk"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((product) => {
            const totalStock = product.inventories.reduce(
              (sum, inv) => sum + inv.quantity,
              0,
            );
            return (
              <div key={product.id} className="p-3 border rounded-xl">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {product.productName === product.name
                        ? product.name
                        : `${product.productName} - ${product.name}`}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {product.skuCode} • {product.primaryUnit}
                    </p>
                  </div>
                  {totalStock === 0 && (
                    <Badge
                      variant="destructive"
                      className="text-[10px] shrink-0"
                    >
                      Habis
                    </Badge>
                  )}
                  {totalStock > 0 && totalStock <= 10 && (
                    <Badge
                      variant="secondary"
                      className="text-[10px] shrink-0 bg-amber-100 text-amber-800"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Sisa Sedikit
                    </Badge>
                  )}
                </div>

                {/* Stock per location */}
                <div className="space-y-1">
                  {product.inventories
                    .filter((inv) => inv.quantity > 0)
                    .map((inv) => {
                      const location = locations.find(
                        (l) => l.id === inv.locationId,
                      );
                      return (
                        <div
                          key={inv.locationId}
                          className="flex justify-between text-xs"
                        >
                          <span className="text-muted-foreground truncate">
                            {location?.name || "Unknown"}
                          </span>
                          <span className="font-medium tabular-nums">
                            {inv.quantity.toLocaleString("id-ID")}{" "}
                            {product.primaryUnit}
                          </span>
                        </div>
                      );
                    })}
                  {product.inventories.every((inv) => inv.quantity === 0) && (
                    <p className="text-xs text-muted-foreground italic">
                      Tidak ada stok di semua gudang
                    </p>
                  )}
                </div>

                {/* Total */}
                <div className="flex justify-between items-center mt-2 pt-2 border-t text-sm">
                  <span className="text-muted-foreground">Total Stok</span>
                  <span className="font-bold">
                    {totalStock.toLocaleString("id-ID")} {product.primaryUnit}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
