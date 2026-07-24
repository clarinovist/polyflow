"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Search,
  Trash2,
  Loader2,
  Plus,
  UserPlus,
  PackagePlus,
} from "lucide-react";
import { createSalesOrder } from "@/actions/sales/sales";
import { quickCreateCustomer } from "@/actions/sales/customer";
import { quickCreateProduct } from "@/actions/product";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/utils/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MobileStickyActions, MobileStickyActionsSpacer } from "@/components/ui/mobile-sticky-actions";

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

const UNIT_OPTIONS = [
  { value: "KG", label: "KG" },
  { value: "ROLL", label: "Roll" },
  { value: "BAL", label: "Bal" },
  { value: "PACK", label: "Pack/PCS" },
  { value: "ZAK", label: "Zak" },
  { value: "KARTON", label: "Karton" },
];

export function QuickOrderWizard({
  customers: initialCustomers,
  products: initialProducts,
  locations,
  preselectedCustomerId,
}: QuickOrderWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamic lists (can grow when user adds new customer/product)
  const [customers, setCustomers] = useState(initialCustomers);
  const [products, setProducts] = useState(initialProducts);

  // Step 1: Customer & Location
  const [customerId, setCustomerId] = useState(preselectedCustomerId || "");
  const [locationId, setLocationId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  // Step 2: Items
  const [items, setItems] = useState<OrderItem[]>([]);
  const [productSearch, setProductSearch] = useState("");

  // Step 3: Review
  const [notes, setNotes] = useState("");

  // Quick-add dialog state
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [showAddProduct, setShowAddProduct] = useState(false);

  // Quick-add customer form
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);

  // Quick-add product form
  const [newProductName, setNewProductName] = useState("");
  const [newVariantName, setNewVariantName] = useState("");
  const [newSkuCode, setNewSkuCode] = useState("");
  const [newUnit, setNewUnit] = useState("KG");
  const [newSellPrice, setNewSellPrice] = useState("");
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  const selectedCustomer = customers.find((c) => c.id === customerId);

  // Customer filtering
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch) return true;
    const q = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.code?.toLowerCase().includes(q)
    );
  });

  // Product filtering
  const filteredProducts = products.filter((p) => {
    if (!productSearch) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.productName.toLowerCase().includes(q) ||
      p.skuCode.toLowerCase().includes(q)
    );
  });

  const displayProducts = productSearch
    ? filteredProducts
    : filteredProducts.slice(0, 50);

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

  // Quick-add customer handler
  const handleAddCustomer = async () => {
    if (!newCustomerName.trim()) {
      toast.error("Nama customer wajib diisi");
      return;
    }
    setIsAddingCustomer(true);
    try {
      const result = await quickCreateCustomer({
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || undefined,
        billingAddress: newCustomerAddress.trim() || undefined,
      });

      if (result.success && result.data) {
        const newCustomer = result.data as Customer;
        setCustomers((prev) => [newCustomer, ...prev]);
        setCustomerId(newCustomer.id);
        setCustomerSearch("");
        setShowAddCustomer(false);
        setNewCustomerName("");
        setNewCustomerPhone("");
        setNewCustomerAddress("");
        toast.success(`Customer "${newCustomer.name}" berhasil dibuat`);
      } else if (!result.success) {
        toast.error(result.error || "Gagal membuat customer");
      }
    } catch {
      toast.error("Gagal membuat customer");
    } finally {
      setIsAddingCustomer(false);
    }
  };

  // Quick-add product handler
  const handleAddProduct = async () => {
    if (!newProductName.trim()) {
      toast.error("Nama produk wajib diisi");
      return;
    }
    if (!newSkuCode.trim()) {
      toast.error("SKU wajib diisi");
      return;
    }
    setIsAddingProduct(true);
    try {
      const result = await quickCreateProduct({
        productName: newProductName.trim(),
        variantName: newVariantName.trim() || newProductName.trim(),
        skuCode: newSkuCode.trim().toUpperCase(),
        primaryUnit: newUnit,
        sellPrice: newSellPrice ? Number(newSellPrice) : undefined,
      });

      if (result.success && result.data) {
        const newProduct = result.data as Product;
        setProducts((prev) => [newProduct, ...prev]);
        addItem(newProduct);
        setShowAddProduct(false);
        setNewProductName("");
        setNewVariantName("");
        setNewSkuCode("");
        setNewUnit("KG");
        setNewSellPrice("");
        toast.success(`Produk "${newProduct.productName}" berhasil dibuat`);
      } else if (!result.success) {
        toast.error(result.error || "Gagal membuat produk");
      }
    } catch {
      toast.error("Gagal membuat produk");
    } finally {
      setIsAddingProduct(false);
    }
  };

  const handleSubmit = async () => {
    if (!customerId || items.length === 0) return;

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
          ppnMode: 'EXCLUDE' as 'INCLUDE' | 'EXCLUDE',
        })),
      });

      if (result.success) {
        toast.success("Order berhasil dibuat!");
        router.push("/field/sales");
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

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1 last:flex-none">
            <div
              className={`h-2.5 w-2.5 rounded-full shrink-0 transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
            {s < 3 && (
              <div
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  s < step ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Customer & Location */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold">Pilih Customer</h2>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Customer *</label>
            {/* Customer Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari customer..."
                value={
                  selectedCustomer && !customerSearch
                    ? selectedCustomer.name
                    : customerSearch
                }
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  if (selectedCustomer && e.target.value !== selectedCustomer.name) {
                    setCustomerId("");
                  }
                }}
                onFocus={() => {
                  if (selectedCustomer) {
                    setCustomerSearch(selectedCustomer.name);
                    setCustomerId("");
                  }
                }}
                className="pl-9 h-11"
              />
            </div>
            {/* Customer quick list */}
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              {filteredCustomers.length === 0 && customerSearch ? (
                <p className="p-3 text-sm text-muted-foreground text-center">
                  Customer tidak ditemukan
                </p>
              ) : (
                filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCustomerId(c.id);
                      setCustomerSearch("");
                    }}
                    className={`w-full text-left p-3 text-sm border-b last:border-0 flex justify-between items-center ${
                      customerId === c.id
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="truncate block">{c.name}</span>
                      {c.code && (
                        <span className="text-[10px] text-muted-foreground">
                          {c.code}
                        </span>
                      )}
                    </div>
                    {customerId === c.id && (
                      <Check className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                ))
              )}
              {/* Add Customer Button */}
              <button
                type="button"
                onClick={() => setShowAddCustomer(true)}
                className="w-full text-left p-3 text-sm border-t flex items-center gap-2 text-primary hover:bg-primary/5 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                <span className="font-medium">Tambah Customer Baru</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              Gudang Sumber <span className="text-muted-foreground/60">(opsional)</span>
            </label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="w-full h-11 px-3 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-primary/20 outline-none"
            >
              <option value="">Semua gudang</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Bisa dikosongkan untuk order cepat. Pilih gudang saat ingin kirim barang.
            </p>
          </div>

          <Button
            className="w-full h-11 hidden md:flex"
            disabled={!customerId}
            onClick={() => setStep(2)}
          >
            Selanjutnya
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <MobileStickyActionsSpacer />
          <MobileStickyActions aboveBottomNav>
            <Button
              className="flex-1 h-11"
              disabled={!customerId}
              onClick={() => setStep(2)}
            >
              Selanjutnya
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </MobileStickyActions>
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
          <div className="max-h-48 overflow-y-auto border rounded-lg">
            {displayProducts.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Produk tidak ditemukan
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNewProductName(productSearch);
                    setShowAddProduct(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-sm text-primary font-medium hover:underline"
                >
                  <PackagePlus className="h-4 w-4" />
                  Tambah &quot;{productSearch}&quot; sebagai produk baru
                </button>
              </div>
            ) : (
              <>
                {displayProducts.map((p) => {
                  const totalStock = p.inventories.reduce(
                    (sum, inv) => sum + inv.quantity,
                    0,
                  );
                  const locationStock = locationId
                    ? p.inventories.find((inv) => inv.locationId === locationId)?.quantity ?? 0
                    : null;
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
                            {locationStock !== null
                              ? `Stok gudang: ${locationStock} (total: ${totalStock})`
                              : `Stok: ${totalStock}`}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {/* Add Product Button */}
                <button
                  type="button"
                  onClick={() => setShowAddProduct(true)}
                  className="w-full text-left p-3 text-sm border-t flex items-center gap-2 text-primary hover:bg-primary/5 transition-colors"
                >
                  <PackagePlus className="h-4 w-4" />
                  <span className="font-medium">Tambah Produk Baru</span>
                </button>
              </>
            )}
          </div>

          {/* Added Items */}
          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Belum ada produk ditambahkan
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
            className="w-full h-11 hidden md:flex"
            disabled={items.length === 0}
            onClick={() => setStep(3)}
          >
            Review Order
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <MobileStickyActionsSpacer />
          <MobileStickyActions aboveBottomNav>
            <Button
              className="flex-1 h-11"
              disabled={items.length === 0}
              onClick={() => setStep(3)}
            >
              Review Order
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </MobileStickyActions>
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
              {locationId
                ? locations.find((l) => l.id === locationId)?.name || "-"
                : <span className="text-muted-foreground italic">Belum ditentukan</span>}
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
            className="w-full h-12 text-base hidden md:flex"
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
          <MobileStickyActionsSpacer />
          <MobileStickyActions aboveBottomNav>
            <Button
              className="flex-1 h-12 text-base"
              disabled={isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <Check className="h-5 w-5 mr-2" />
              )}
              {isSubmitting ? "Membuat..." : "Buat Order"}
            </Button>
          </MobileStickyActions>
        </div>
      )}

      {/* Quick Add Customer Dialog */}
      <Dialog open={showAddCustomer} onOpenChange={setShowAddCustomer}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Tambah Customer Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">
                Nama Customer *
              </label>
              <Input
                placeholder="Nama customer..."
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className="h-11 mt-1"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Telepon
              </label>
              <Input
                placeholder="08xxx..."
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                className="h-11 mt-1"
                type="tel"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Alamat
              </label>
              <Input
                placeholder="Alamat penagihan..."
                value={newCustomerAddress}
                onChange={(e) => setNewCustomerAddress(e.target.value)}
                className="h-11 mt-1"
              />
            </div>
            <Button
              className="w-full h-11"
              disabled={!newCustomerName.trim() || isAddingCustomer}
              onClick={handleAddCustomer}
            >
              {isAddingCustomer ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {isAddingCustomer ? "Menyimpan..." : "Simpan Customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Add Product Dialog */}
      <Dialog open={showAddProduct} onOpenChange={setShowAddProduct}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="h-5 w-5" />
              Tambah Produk Baru
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">
                Nama Produk *
              </label>
              <Input
                placeholder="Contoh: Rafia Hitam"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="h-11 mt-1"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Nama Varian
              </label>
              <Input
                placeholder="Kosongkan jika sama dengan nama produk"
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                className="h-11 mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">
                  SKU *
                </label>
                <Input
                  placeholder="RFH001"
                  value={newSkuCode}
                  onChange={(e) =>
                    setNewSkuCode(e.target.value.toUpperCase())
                  }
                  className="h-11 mt-1"
                  maxLength={20}
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  5-20 karakter, huruf besar & angka
                </p>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">
                  Satuan *
                </label>
                <select
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  className="w-full h-11 mt-1 px-3 border border-input rounded-lg bg-background text-sm"
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                Harga Jual
              </label>
              <Input
                type="number"
                placeholder="0"
                value={newSellPrice}
                onChange={(e) => setNewSellPrice(e.target.value)}
                className="h-11 mt-1"
                min="0"
                step="100"
              />
            </div>
            <Button
              className="w-full h-11"
              disabled={
                !newProductName.trim() ||
                !newSkuCode.trim() ||
                newSkuCode.length < 5 ||
                isAddingProduct
              }
              onClick={handleAddProduct}
            >
              {isAddingProduct ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {isAddingProduct ? "Menyimpan..." : "Simpan Produk"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
