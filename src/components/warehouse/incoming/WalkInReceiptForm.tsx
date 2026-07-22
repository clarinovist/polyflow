"use client";

import React, { useState } from "react";
import { useForm, useFieldArray, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createWalkInReceiptSchema,
  CreateWalkInReceiptValues,
} from "@/lib/schemas/purchasing";
import { createWalkInGoodsReceipt } from "@/actions/purchasing/purchasing";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Trash2, Package, Info, Download } from "lucide-react";
import { ProductCombobox } from "@/components/products/product-combobox";
import { formLabels } from "@/lib/labels";
import Link from "next/link";

interface WalkInReceiptFormProps {
  suppliers: { id: string; name: string; code: string | null }[];
  locations: { id: string; name: string }[];
  productVariants: {
    id: string;
    name: string;
    skuCode: string;
    primaryUnit: string;
    standardCost: number | null;
  }[];
  defaultLocationId?: string;
}

export function WalkInReceiptForm({
  suppliers,
  locations,
  productVariants,
  defaultLocationId,
}: WalkInReceiptFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<CreateWalkInReceiptValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createWalkInReceiptSchema) as any,
    defaultValues: {
      supplierId: "",
      supplierRefNo: "",
      receivedDate: new Date(),
      locationId: defaultLocationId || locations[0]?.id || "",
      notes: "",
      items: [
        {
          productVariantId: "",
          receivedQty: 1,
          unitCost: null,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const onSubmit: SubmitHandler<CreateWalkInReceiptValues> = async (data) => {
    setIsLoading(true);
    try {
      const result = await createWalkInGoodsReceipt(data);
      if (!result.success) {
        toast.error(
          result.error ||
            "Gagal memproses penerimaan dari nota. Silakan coba lagi.",
        );
        setIsLoading(false);
        return;
      }

      const grId = result.data?.goodsReceipt?.id as string | undefined;
      toast.success(
        "Penerimaan dari nota berhasil. PO otomatis dibuat & stok bertambah.",
      );
      if (grId) {
        router.push(`/warehouse/incoming/${grId}`);
      } else {
        router.push("/warehouse/incoming");
      }
      router.refresh();
    } catch (_error) {
      toast.error("Gagal memproses penerimaan. Silakan coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-emerald-600" />
                  Item dari Nota
                </CardTitle>
                <CardDescription>
                  Input qty fisik sesuai barang yang diterima. Harga satuan
                  opsional (default: harga beli terakhir / standard cost).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="p-4 border rounded-lg bg-muted/30 grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
                    >
                      <div className="md:col-span-5">
                        <FormField
                          control={form.control}
                          name={`items.${index}.productVariantId`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                Produk / Material
                              </FormLabel>
                              <FormControl>
                                <ProductCombobox
                                  products={productVariants}
                                  value={f.value}
                                  onValueChange={(id) => {
                                    f.onChange(id);
                                    const pv = productVariants.find(
                                      (p) => p.id === id,
                                    );
                                    if (
                                      pv?.standardCost != null &&
                                      form.getValues(
                                        `items.${index}.unitCost`,
                                      ) == null
                                    ) {
                                      form.setValue(
                                        `items.${index}.unitCost`,
                                        Number(pv.standardCost),
                                      );
                                    }
                                  }}
                                  placeholder="Pilih produk..."
                                  className="h-9 w-full justify-start border-input bg-background"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <FormField
                          control={form.control}
                          name={`items.${index}.receivedQty`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                {formLabels.qty}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="any"
                                  min={0}
                                  value={f.value ?? ""}
                                  onChange={(e) =>
                                    f.onChange(Number(e.target.value))
                                  }
                                  className="h-9"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="md:col-span-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitCost`}
                          render={({ field: f }) => (
                            <FormItem>
                              <FormLabel className="text-xs">
                                Harga (opsional)
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="any"
                                  min={0}
                                  placeholder="Auto"
                                  value={
                                    f.value === null || f.value === undefined
                                      ? ""
                                      : f.value
                                  }
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    f.onChange(
                                      v === "" ? null : Number(v),
                                    );
                                  }}
                                  className="h-9"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="md:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={fields.length <= 1}
                          onClick={() => remove(index)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() =>
                      append({
                        productVariantId: "",
                        receivedQty: 1,
                        unitCost: null,
                      })
                    }
                  >
                    <Plus className="h-4 w-4" /> Tambah Item
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Header Nota</CardTitle>
                <CardDescription>
                  Data supplier & dokumen fisik.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold">
                        Supplier
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih supplier" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                              {s.code ? ` (${s.code})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="supplierRefNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold">
                        No. Nota / Surat Jalan
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="No. dokumen supplier"
                          className="h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold">
                        Lokasi Gudang
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih lokasi" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={loc.id}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="receivedDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-bold">
                        Tanggal Penerimaan
                      </FormLabel>
                      <Input
                        type="date"
                        value={
                          field.value
                            ? new Date(field.value).toISOString().split("T")[0]
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
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {formLabels.notes}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          className="h-20"
                          placeholder="Catatan (opsional)"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md border border-amber-200 dark:border-amber-800 flex gap-3">
                  <Info className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-800 dark:text-amber-200">
                    Sistem akan <strong>membuat PO otomatis</strong> + GR. Stok
                    langsung bertambah. Finance nanti bisa buat invoice dari PO
                    tersebut.
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-11"
                >
                  {isLoading ? (
                    "Memproses..."
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Simpan Penerimaan
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  asChild
                >
                  <Link href="/warehouse/incoming">Batal</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </Form>
  );
}
