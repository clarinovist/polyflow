"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Trash2,
  Loader2,
} from "lucide-react";
import { createSalesOrder } from "@/actions/sales/sales";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/utils/utils";

type Customer = {
  id: string;
  name: string;
  code: string | null;
  creditLimit: number | null;
  paymentTermDays: number | null;
};

type Product = {
  id: string;
  name: string;
  productName: string;
  skuCode: string;
  sellPrice: number | null;
  displayUnit: string;
  inventories: { locationId: string; quantity: number }[];
};

type Location = { id: string; name: string };

interface QuickOrderWizardProps {
  customers: Customer[];
  products: Product[];
  locations: Location[];
  preselectedCustomerId?: string;
}

type OrderItem = {
  productVariantId: string;
  quantity: number;
  unitPrice: number;
};

export function QuickOrderWizard({
  customers,
  products,
  locations,
  preselectedCustomerId,
}: QuickOrderWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step 1: Customer & Location
  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [locationId, setLocationId] = useState("");

  // Step 2: Items
  const [items, setItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // Step 3: Review
  const [notes, setNotes] = useState("");

  const selectedCustomer = customers.find((c) => c.id === customerId);

  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.productName.toLowerCase().includes(q) ||
      p.skuCode.toLowerCase().includes(q)
    );
  });

  const addItem = (product: Product) => {
    const existing = items.find((i) => i.productVariantId === product.id);
    if (existing) {
      setItems(
        items.map((i) =>
          i.productVariantId === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i,
        ),
      );
    } else {
      setItems([
        ...items,
        {
          productVariantId: product.id,
          quantity: 1,
          unitPrice: product.sellPrice || 0,
        },
      ]);
    }
    setProductSearch("");
  };

  const updateItem = (
    productVariantId: string,
    field: keyof OrderItem,
    value: number,
  ) => {
    setItems(
      items.map((i) =>
        i.productVariantId === productVariantId ? { ...i, [field]: value } : i,
      ),
    );
  };

  const removeItem = (productVariantId: string) => {
    setItems(items.filter((i) => i.productVariantId !== productVariantId));
  };

  const total = items.reduce((sum, item) => {
    const sub = item.quantity * item.unitPrice;
    return sum + sub;
  }, 0);

  const handleSubmit = async () => {
    if (!customerId || !locationId || items.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await createSalesOrder({
        customerId,
        sourceLocationId: locationId,
        orderDate: new Date(),
        orderType: "MAKE_TO_STOCK",
        notes: notes || "",
        shippingCost: 0,
        customItems: [],
        items: items.map((item) => ({
          productVariantId: item.productVariantId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: 0,
          taxPercent: 0,
          dppOtherAmount: null,
        })), 
      });

      if (result.success) {
        toast.success("Order berhasil dibuat!");
        router.push("/sales/mobile");
      } else {
        toast.error(result.error || "Gagal membuat order");
      }
    } catch {
      toast.error("Gagal membuat pesanan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => (step === 1 ? router.back() : setStep(step - 1))}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">Order Baru</h1>
          <p className="text-xs text-muted-foreground">Langkah {step} dari 3</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="flex gap-1">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Customer & Location */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Pilih Customer & Gudang</h2>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Customer *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari customer..."
                value={
                  selectedCustomer
                    ? selectedCustomer.name
                    : customerId
                      ? "Customer dipilih"
                      : ""
                }
                readOnly
                className="pl-9 h-11"
              />
            </div>
            {/* Customer quick list */}
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {customers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCustomerId(c.id)}
                  className={`w-full text-left p-3 text-sm border-b last:border-0 flex justify-between items-center ${
                    customerId === c.id
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  {customerId === c.id && (
                    <Check className="h-4 w-4 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Gudang Sumber *
            </label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Pilih gudang" />
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

          <Button
            className="w-full h-11"
            disabled={!customerId || !locationId}
            onClick={() => setStep(2)}
          >
            Selanjutnya
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 2: Add Products */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Tambah Produk</h2>

          {/* Product Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari produk..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          {/* Product Results */}
          {productSearch && (
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {filteredProducts.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">
                  Produk tidak ditemukan
                </p>
              ) : (
                filteredProducts.map((p) => {
                  const stock = p.inventories.reduce(
                    (sum, inv) => sum + inv.quantity,
                    0,
                  );
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addItem(p)}
                      className="w-full text-left p-3 border-b last:border-0 hover:bg-muted/50"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm font-medium truncate">
                            {p.productName === p.name
                              ? p.name
                              : `${p.productName} - ${p.name}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.skuCode} • {p.displayUnit}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {p.sellPrice ? formatRupiah(p.sellPrice) : "-"}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Stok: {stock}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Added Items */}
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Ketik nama produk untuk menambahkan
              </p>
            ) : (
              items.map((item) => {
                const product = products.find(
                  (p) => p.id === item.productVariantId,
                );
                if (!product) return null;
                return (
                  <div
                    key={item.productVariantId}
                    className="p-3 border rounded-lg space-y-2"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {product.productName === product.name
                            ? product.name
                            : `${product.productName} - ${product.name}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {product.skuCode}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => removeItem(item.productVariantId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">
                          Qty
                        </label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              item.productVariantId,
                              "quantity",
                              Number(e.target.value) || 1,
                            )
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">
                          Harga
                        </label>
                        <Input
                          type="number"
                          min="0"
                          step="100"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(
                              item.productVariantId,
                              "unitPrice",
                              Number(e.target.value) || 0,
                            )
                          }
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-right font-medium">
                      Subtotal: {formatRupiah(item.quantity * item.unitPrice)}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <Button
            className="w-full h-11"
            disabled={items.length === 0}
            onClick={() => setStep(3)}
          >
            Review Order
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Review Order</h2>

          {/* Customer Info */}
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground">Customer</p>
            <p className="font-medium">{selectedCustomer?.name || "-"}</p>
            <p className="text-xs text-muted-foreground mt-1">Gudang</p>
            <p className="font-medium">
              {locations.find((l) => l.id === locationId)?.name || "-"}
            </p>
          </div>

          {/* Items Summary */}
          <div className="space-y-2">
            {items.map((item) => {
              const product = products.find(
                (p) => p.id === item.productVariantId,
              );
              if (!product) return null;
              return (
                <div
                  key={item.productVariantId}
                  className="flex justify-between items-center p-3 border rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatRupiah(item.unitPrice)}
                    </p>
                  </div>
                  <p className="font-semibold text-sm shrink-0">
                    {formatRupiah(item.quantity * item.unitPrice)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground">
              Catatan (opsional)
            </label>
            <Input
              placeholder="Catatan order..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11 mt-1"
            />
          </div>

          {/* Total */}
          <div className="p-4 bg-muted rounded-xl">
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="text-lg font-bold">{formatRupiah(total)}</span>
            </div>
          </div>

          <Button
            className="w-full h-12 text-base"
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
            ) : (
              <Check className="h-5 w-5 mr-2" />
            )}
            {isSubmitting ? "Membuat Order..." : "Buat Order"}
          </Button>
        </div>
      )}
    </div>
  );
}
