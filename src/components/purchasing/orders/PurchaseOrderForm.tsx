"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  useForm,
  useFieldArray,
  SubmitHandler,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  CreatePurchaseOrderValues,
  UpdatePurchaseOrderValues,
} from "@/lib/schemas/purchasing";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
} from "@/actions/purchasing/purchasing";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Plus, Trash2, ShoppingBag, Calculator } from "lucide-react";
import { formatRupiah } from "@/lib/utils/utils";
import { ProductCombobox } from "@/components/products/product-combobox";
import { SupplierCombobox } from "@/components/purchasing/suppliers/supplier-combobox";
import { Badge } from "@/components/ui/badge";
import { purchasingLabels, formLabels, actionLabels } from "@/lib/labels";

interface PurchaseOrderFormProps {
  suppliers: { id: string; name: string; code: string | null; paymentTermDays: number | null }[];
  productVariants: {
    id: string;
    name: string;
    skuCode: string;
    buyPrice: number | null;
  }[];
  mode?: "create" | "edit";
  initialData?: {
    id: string;
    supplierId: string;
    orderDate: Date | string;
    expectedDate?: Date | string | null;
    deliveryAddress?: string | null;
    notes?: string | null;
    shippingCost?: number | null;
    items: {
      id?: string;
      productVariantId: string;
      quantity: number;
      unitPrice: number;
      discountPercent?: number;
      taxPercent?: number;
      dppOtherAmount?: number | null;
    }[];
  };
}

export function PurchaseOrderForm({
  suppliers,
  productVariants,
  mode = "create",
  initialData,
}: PurchaseOrderFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CreatePurchaseOrderValues>({
    resolver: zodResolver(
      mode === "create" ? createPurchaseOrderSchema : updatePurchaseOrderSchema,
    ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    defaultValues: initialData
      ? {
          supplierId: initialData.supplierId,
          orderDate: new Date(initialData.orderDate),
          expectedDate: initialData.expectedDate
            ? new Date(initialData.expectedDate)
            : null,
          deliveryAddress: initialData.deliveryAddress ?? "",
          notes: initialData.notes ?? "",
          shippingCost: initialData.shippingCost
            ? Number(initialData.shippingCost)
            : 0,
          items: initialData.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            discountPercent: item.discountPercent
              ? Number(item.discountPercent)
              : 0,
            taxPercent: item.taxPercent ? Number(item.taxPercent) : 0,
            dppOtherAmount: item.dppOtherAmount ? Number(item.dppOtherAmount) : null,
          })),
        }
      : {
          supplierId: "",
          orderDate: new Date(),
          expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          deliveryAddress: "",
          notes: "",
          shippingCost: 0,
          items: [
            {
              productVariantId: "",
              quantity: 1,
              unitPrice: 0,
              discountPercent: 0,
              taxPercent: 0,
              dppOtherAmount: null,
            },
          ],
        },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({
    control: form.control,
    name: "items",
  });

  const watchedShippingCost =
    useWatch({ control: form.control, name: "shippingCost" }) || 0;

  const watchedSupplierId = useWatch({ control: form.control, name: "supplierId" });
  const selectedSupplier = suppliers.find((s) => s.id === watchedSupplierId);

  // Auto-calculate DPP Nilai Lainnya = DPP × 11/12 when qty, price, or discount changes
  useEffect(() => {
    const items = form.getValues("items");
    items.forEach((item, index) => {
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice || 0);
      const discount = Number(item.discountPercent || 0);
      const dpp = qty * price * (1 - discount / 100);
      const autoDppOther = dpp > 0 ? Math.round(dpp * 11 / 12 * 100) / 100 : null;
      const current = item.dppOtherAmount;
      if (current !== autoDppOther) {
        form.setValue(`items.${index}.dppOtherAmount`, autoDppOther, { shouldDirty: false });
      }
    });
  }, [watchedItems, form]);

  const totals = useMemo(() => {
    return watchedItems.reduce(
      (acc, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const rawSubtotal = qty * price;
        const discount =
          rawSubtotal * (Number(item.discountPercent || 0) / 100);
        const taxable = rawSubtotal - discount;
        const tax = taxable * (Number(item.taxPercent || 0) / 100);
        acc.gross += rawSubtotal;
        acc.discount += discount;
        acc.tax += tax;
        acc.net += taxable + tax;
        return acc;
      },
      { gross: 0, discount: 0, tax: 0, net: 0 },
    );
  }, [watchedItems]);

  const onSubmit: SubmitHandler<CreatePurchaseOrderValues> = async (data) => {
    if (mode === "edit") {
      const confirmed = window.confirm(
        "Apakah Anda yakin ingin menyimpan perubahan pada PO ini? Perubahan harga/qty akan mempengaruhi total dan jurnal yang sudah terbentuk.",
      );
      if (!confirmed) return;
    }

    setIsLoading(true);
    try {
      if (mode === "edit" && initialData?.id) {
        const result = await updatePurchaseOrder({
          ...data,
          id: initialData.id,
        } as UpdatePurchaseOrderValues);
        if (result.success) {
          toast.success("Purchase Order berhasil diupdate");
          router.push(`/purchasing/orders/${initialData.id}`);
          router.refresh();
        } else {
          toast.error(
            result.error || "Gagal update Purchase Order. Silakan coba lagi.",
          );
        }
      } else {
        const result = await createPurchaseOrder(data);
        if (result.success) {
          toast.success("Purchase Order berhasil dibuat");
          if (result.data?.id) {
            router.push(`/purchasing/orders/${result.data.id}`);
          }
        } else {
          toast.error(
            result.error || "Gagal membuat Purchase Order. Silakan coba lagi.",
          );
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductChange = (index: number, variantId: string) => {
    const variant = productVariants.find((v) => v.id === variantId);
    if (variant) {
      form.setValue(`items.${index}.unitPrice`, Number(variant.buyPrice || 0));
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {mode === "edit" && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">⚠️ Mode Edit PO</p>
            <ul className="mt-1 list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
              <li>Harga satuan tidak bisa diubah jika sudah ada invoice</li>
              <li>
                Qty tidak bisa dikurangi di bawah jumlah yang sudah diterima
              </li>
              <li>Perubahan akan memperbarui total PO</li>
            </ul>
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (Items) - spans 8 columns */}
          <div className="lg:col-span-8 space-y-6">
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
              <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b pb-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-emerald-600" />
                      Item PO
                    </CardTitle>
                    <CardDescription>
                      Pilih produk dan kuantitas.
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-white">
                    {fields.length} Item
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {fields.map((field, index) => {
                  const item = watchedItems[index];
                  const qty = Number(item?.quantity || 0);
                  const price = Number(item?.unitPrice || 0);
                  const disc = Number(item?.discountPercent || 0);
                  const tax = Number(item?.taxPercent || 0);
                  const raw = qty * price;
                  const discountAmount = raw * (disc / 100);
                  const taxable = raw - discountAmount;
                  const taxAmount = taxable * (tax / 100);
                  const lineTotal = taxable + taxAmount;

                  return (
                    <div
                      key={field.id}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900/50 overflow-hidden"
                    >
                      {/* Header: Product + Qty + Delete */}
                      <div className="flex items-center gap-3 p-4 pb-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <FormField
                            control={form.control}
                            name={`items.${index}.productVariantId`}
                            render={({ field }) => (
                              <FormItem className="space-y-0">
                                <FormControl>
                                  <ProductCombobox
                                    products={productVariants.map((v) => ({
                                      id: v.id,
                                      name: v.name,
                                      skuCode: v.skuCode,
                                      buyPrice: v.buyPrice,
                                    }))}
                                    value={field.value}
                                    onValueChange={(val) => {
                                      field.onChange(val);
                                      handleProductChange(index, val);
                                    }}
                                    placeholder="Pilih produk..."
                                    className="h-9 border-0 bg-transparent shadow-none p-0 hover:bg-transparent font-medium text-foreground w-full justify-start"
                                    onCreateNew={() =>
                                      router.push("/dashboard/products/create")
                                    }
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field }) => (
                            <FormItem className="space-y-0">
                              <FormControl>
                                <Input
                                  type="number"
                                  {...field}
                                  onChange={(e) =>
                                    field.onChange(Number(e.target.value))
                                  }
                                  className="h-9 w-20 text-center font-mono text-sm"
                                  min={1}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Body: Price fields */}
                      <div className="px-4 pb-3 space-y-2">
                        {/* Harga Satuan */}
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground w-28">Harga Satuan</span>
                          <FormField
                            control={form.control}
                            name={`items.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem className="space-y-0 flex-1 max-w-[200px]">
                                <FormControl>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rp</span>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(Number(e.target.value))
                                      }
                                      className="h-8 pl-8 text-right font-mono text-sm"
                                    />
                                  </div>
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Diskon */}
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground w-28">Diskon</span>
                          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                            <FormField
                              control={form.control}
                              name={`items.${index}.discountPercent`}
                              render={({ field }) => (
                                <FormItem className="space-y-0 w-20">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(Number(e.target.value))
                                      }
                                      className="h-8 text-center font-mono text-sm"
                                      min={0}
                                      max={100}
                                      placeholder="0"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            <span className="text-xs font-mono text-red-500 ml-auto">
                              {discountAmount > 0 ? `-${formatRupiah(discountAmount)}` : "Rp 0"}
                            </span>
                          </div>
                        </div>

                        {/* Pajak */}
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground w-28">Pajak</span>
                          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                            <FormField
                              control={form.control}
                              name={`items.${index}.taxPercent`}
                              render={({ field }) => (
                                <FormItem className="space-y-0 w-20">
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(Number(e.target.value))
                                      }
                                      className="h-8 text-center font-mono text-sm"
                                      min={0}
                                      max={100}
                                      placeholder="0"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                            <span className="text-xs font-mono text-muted-foreground ml-auto">
                              {taxAmount > 0 ? formatRupiah(taxAmount) : "Rp 0"}
                            </span>
                          </div>
                        </div>

                        {/* DPP Nilai Lainnya */}
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs text-muted-foreground w-28">DPP Nilai Lain</span>
                          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                            <FormField
                              control={form.control}
                              name={`items.${index}.dppOtherAmount`}
                              render={({ field }) => (
                                <FormItem className="space-y-0 flex-1">
                                  <FormControl>
                                    <div className="relative">
                                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">Rp</span>
                                      <Input
                                        type="number"
                                        value={field.value ?? ""}
                                        onChange={(e) =>
                                          field.onChange(e.target.value === "" ? null : Number(e.target.value))
                                        }
                                        className="h-8 pl-8 text-right font-mono text-sm bg-zinc-50 dark:bg-zinc-900"
                                        placeholder="Auto (11/12)"
                                      />
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Footer: Total */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-t">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</span>
                        <span className="text-sm font-bold font-mono">{formatRupiah(lineTotal)}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="p-4 border-t bg-muted/10">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      append({
                        productVariantId: "",
                        quantity: 1,
                        unitPrice: 0,
                        discountPercent: 0,
                        taxPercent: 0,
                        dppOtherAmount: null,
                      })
                    }
                    className="w-full border-dashed text-muted-foreground hover:text-foreground hover:border-solid hover:bg-white"
                  >
                    <Plus className="h-4 w-4 mr-2" /> {actionLabels.add} Item
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-none bg-transparent">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs uppercase font-bold text-muted-foreground">
                      {formLabels.notes}
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Tambahkan catatan internal, pengingat termin pembayaran, atau instruksi khusus..."
                        className="resize-none bg-white dark:bg-zinc-900 min-h-[100px]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </Card>
          </div>

          {/* Right Column (Summary) - spans 4 columns */}
          <div className="lg:col-span-4 space-y-6">
            <Card className="sticky top-6 border-zinc-200 shadow-lg overflow-hidden">
              <div className="bg-zinc-900 text-white p-6">
                <div className="flex items-center gap-2 text-zinc-400 text-xs uppercase tracking-widest font-bold mb-4">
                  <Calculator className="h-3 w-3" /> Estimasi Total
                </div>
                <div className="text-3xl font-bold font-mono tracking-tight">
                  {formatRupiah(totals.net + watchedShippingCost)}
                </div>
              </div>

              <CardContent className="p-6 space-y-4">
                {/* Breakdown */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono">
                      {formatRupiah(totals.gross)}
                    </span>
                  </div>
                  {totals.discount > 0 && (
                    <div className="flex justify-between text-red-500">
                      <span>Diskon</span>
                      <span className="font-mono">
                        -{formatRupiah(totals.discount)}
                      </span>
                    </div>
                  )}
                  {totals.tax > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Pajak</span>
                      <span className="font-mono">
                        {formatRupiah(totals.tax)}
                      </span>
                    </div>
                  )}
                  <FormField
                    control={form.control}
                    name="shippingCost"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between gap-2">
                        <FormLabel className="text-muted-foreground whitespace-nowrap">
                          Ongkir
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) =>
                              field.onChange(Number(e.target.value))
                            }
                            className="h-8 w-32 text-right font-mono text-sm"
                            min={0}
                            placeholder="0"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Total</span>
                    <span className="font-mono">
                      {formatRupiah(totals.net + watchedShippingCost)}
                    </span>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pilih Supplier</FormLabel>
                      <FormControl>
                        <SupplierCombobox
                          suppliers={suppliers}
                          value={field.value}
                          onValueChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tempo (Payment Terms) — read-only from supplier */}
                {selectedSupplier?.paymentTermDays != null && (
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-900 rounded-md border">
                    <span className="text-sm text-muted-foreground">Tempo</span>
                    <span className="text-sm font-semibold">{selectedSupplier.paymentTermDays} Hari</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="orderDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>{purchasingLabels.poDate}</FormLabel>
                        <Input
                          type="date"
                          value={
                            field.value
                              ? new Date(field.value)
                                  .toISOString()
                                  .split("T")[0]
                              : ""
                          }
                          onChange={(e) =>
                            field.onChange(new Date(e.target.value))
                          }
                          className="h-10"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Estimasi Pengiriman</FormLabel>
                        <Input
                          type="date"
                          value={
                            field.value
                              ? new Date(field.value)
                                  .toISOString()
                                  .split("T")[0]
                              : ""
                          }
                          onChange={(e) =>
                            field.onChange(new Date(e.target.value))
                          }
                          className="h-10"
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Dikirim Ke (Delivery Address) */}
                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dikirim Ke</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Alamat pengiriman barang..."
                          className="h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-4 border-t">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                        {mode === "edit" ? "Menyimpan..." : "Membuat..."}
                      </span>
                    ) : mode === "edit" ? (
                      "Simpan Perubahan"
                    ) : (
                      "Konfirmasi Purchase Order"
                    )}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground mt-3">
                    {mode === "edit"
                      ? "Perubahan akan memperbarui total dan jurnal."
                      : "Membuat pesanan draft. Persetujuan mungkin diperlukan."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
