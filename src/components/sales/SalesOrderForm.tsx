"use client";

import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createSalesOrderSchema,
  CreateSalesOrderValues,
  UpdateSalesOrderValues,
  updateSalesOrderSchema,
} from "@/lib/schemas/sales";
import { createSalesOrder, updateSalesOrder } from "@/actions/sales/sales";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatRupiah } from "@/lib/utils/utils";
import { CalendarIcon, Plus, Trash2, Loader2, Check } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { SalesOrderType, ProductType, Unit } from "@prisma/client";
import { useAction } from "@/hooks/use-action";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  getProductionUnitMeta,
  toBaseQuantity,
} from "@/lib/utils/production-units";
import { salesLabels, formLabels, actionLabels } from "@/lib/labels";
import { computeOrderTotals } from "@/lib/utils/order-totals";
import type {
  SerializedProductVariant,
  SalesOrderFormProps,
} from "./sales-order-types";
import { QuickProductDialog } from "./QuickProductDialog";

export function SalesOrderForm({
  customers,
  locations,
  products,
  mode,
  initialData,
  reorderData,
}: SalesOrderFormProps) {
  const router = useRouter();
  const [openCustomer, setOpenCustomer] = useState(false);
  const [openProduct, setOpenProduct] = useState<Record<number, boolean>>({});
  const [mobileProductSearch, setMobileProductSearch] = useState<{
    open: boolean;
    index: number;
  }>({ open: false, index: 0 });
  const [newProducts, setNewProducts] = useState<SerializedProductVariant[]>(
    [],
  );
  const [quickAddIndex, setQuickAddIndex] = useState<number | null>(null);
  const [customItemIndex, setCustomItemIndex] = useState<number | null>(null);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customItems, setCustomItems] = useState<
    { tempId: string; name: string; sellPrice: number }[]
  >([]);

  // Filter locations for stock-based sales fulfillment (Finished Good, Scrap & Packing)
  const stockFulfillmentLocations = locations.filter(
    (l) =>
      l.locationType !== "CUSTOMER_OWNED" &&
      (l.slug?.includes("finished") ||
        l.slug?.includes("scrap") ||
        l.slug?.includes("packing") ||
        l.name.toLowerCase().includes("finished") ||
        l.name.toLowerCase().includes("scrap") ||
        l.name.toLowerCase().includes("packing")),
  );

  const maklonProductionLocations = locations.filter(
    (l) => l.locationType === "CUSTOMER_OWNED",
  );

  // Unified type to satisfy react-hook-form's need for a consistent generic standard
  type SalesOrderFormValues = {
    id?: string;
    customerId?: string;
    sourceLocationId: string;
    orderDate: Date;
    expectedDate?: Date | null;
    orderType?: SalesOrderType; // Optional in form state logic, handled by schema defaults
    notes?: string;
    shippingCost?: number;
    items: {
      id?: string;
      productVariantId: string;
      quantity: number;
      unitPrice: number;
      enteredQuantity?: number;
      enteredUnit?: Unit;
      conversionFactorSnapshot?: number;
      enteredUnitPrice?: number;
      discountPercent?: number;
      taxPercent?: number;
    }[];
    customItems?: {
      tempId: string;
      name: string;
      sellPrice: number;
    }[];
  };

  const form = useForm<SalesOrderFormValues>({
    resolver: zodResolver(
      mode === "create" ? createSalesOrderSchema : updateSalesOrderSchema,
    ) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    defaultValues: initialData
      ? {
          ...initialData,
          orderType:
            ((initialData as Record<string, unknown>)
              .orderType as SalesOrderType) || "MAKE_TO_STOCK", // Ensure orderType exists for form state
        }
      : reorderData
        ? {
            customerId: reorderData.customerId,
            sourceLocationId: reorderData.sourceLocationId,
            orderDate: new Date(),
            orderType:
              (reorderData.orderType as SalesOrderType) || "MAKE_TO_STOCK",
            notes: reorderData.notes || "",
            shippingCost: reorderData.shippingCost || 0,
            items: reorderData.items.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountPercent: item.discountPercent,
              taxPercent: item.taxPercent,
            })),
          }
        : {
            customerId: "",
            sourceLocationId: "",
            orderDate: new Date(),
            notes: "",
            shippingCost: 0,
            items: [
              {
                productVariantId: "",
                quantity: 1,
                unitPrice: 0,
                discountPercent: 0,
                taxPercent: 0,
              },
            ],
            orderType: "MAKE_TO_STOCK" as SalesOrderType,
          },
  });

  // Filter products based on selected source location
  // Unified types and watching
  const selectedSourceLocationId = useWatch({
    control: form.control,
    name: "sourceLocationId",
  });
  const selectedOrderType = useWatch({
    control: form.control,
    name: "orderType",
  });

  const selectableLocations =
    selectedOrderType === "MAKLON_JASA"
      ? maklonProductionLocations
      : stockFulfillmentLocations;

  const productEmptyMessage =
    selectedOrderType === "MAKLON_JASA"
      ? "Tidak ada service item untuk Maklon Jasa. Stok fisik di Maklon Packing Area dipakai saat production execution, bukan dipilih sebagai item sales."
      : "Tidak ada produk ditemukan.";

  const sourceLocationLabel =
    selectedOrderType === "MAKLON_JASA"
      ? salesLabels.customerWarehouse
      : `${salesLabels.sourceWarehouse} (Warehouse)`;

  const sourceLocationPlaceholder =
    selectedOrderType === "MAKLON_JASA"
      ? "Pilih gudang customer"
      : "Pilih gudang";

  const sourceLocationDescription =
    selectedOrderType === "MAKLON_JASA"
      ? "Untuk Maklon Jasa, field ini harus memakai warehouse customer-owned. Lokasi ini menjadi default sumber bahan titipan customer untuk flow maklon, lalu Production Execution tetap memprioritaskan stok yang sudah dipindah ke lokasi proses jika ada."
      : "Pilih gudang sumber untuk reservasi dan shipment stok fisik.";

  const filteredProducts = useMemo(() => {
    const allProducts = [...products, ...newProducts];
    let baseProducts = allProducts;

    // Filter by ProductType based on OrderType
    if (selectedOrderType === "MAKLON_JASA") {
      baseProducts = products.filter(
        (p) => p.product.productType === ProductType.SERVICE,
      );
    } else {
      baseProducts = products.filter(
        (p) => p.product.productType !== ProductType.SERVICE,
      );
    }

    if (!selectedSourceLocationId) return baseProducts;

    // Filter by inventory if a sourceLocationId is chosen
    if (
      selectedOrderType === "MAKE_TO_ORDER" ||
      selectedOrderType === "MAKLON_JASA"
    )
      return baseProducts;

    // For MTS, only show products that have stock in the selected location
    return baseProducts.filter((p: SerializedProductVariant) =>
      p.inventories.some(
        (inv) =>
          inv.locationId === selectedSourceLocationId && inv.quantity > 0,
      ),
    );
  }, [products, newProducts, selectedSourceLocationId, selectedOrderType]);

  // Clear customerId if Order Type is MTS
  /* useEffect(() => {
         if (selectedOrderType === 'MAKE_TO_STOCK') {
             form.setValue('customerId', '');
         }
     }, [selectedOrderType, form]); */
  // Better to just hide and not force clear immediately to avoid accidental data loss if switching back and forth?
  // But validation might fail if we leave it? Schema says optional. So it's fine.

  // Calculate totals
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = useWatch({ control: form.control, name: "items" });
  const watchShippingCost =
    useWatch({ control: form.control, name: "shippingCost" }) || 0;

  const getLineVariant = (index: number) => {
    const productVariantId = form.getValues(`items.${index}.productVariantId`);
    return products.find((p) => p.id === productVariantId);
  };

  const getLineUnitMeta = (index: number) => {
    const variant = getLineVariant(index);
    return variant ? getProductionUnitMeta(variant) : null;
  };

  const toDisplayUnitPrice = (
    variant: SerializedProductVariant,
    baseUnitPrice: number,
  ) => {
    const meta = getProductionUnitMeta(variant);
    return meta.hasAlternateUnit
      ? baseUnitPrice * meta.conversionFactor
      : baseUnitPrice;
  };

  const selectProduct = (index: number, variant: SerializedProductVariant) => {
    form.setValue(`items.${index}.productVariantId`, variant.id);
    const currentPrice = form.getValues(`items.${index}.unitPrice`);
    if (!currentPrice || currentPrice === 0) {
      form.setValue(
        `items.${index}.unitPrice`,
        toDisplayUnitPrice(variant, variant.sellPrice || 0),
      );
    }
  };

  const handleQuickProductCreated = (
    newVariant: SerializedProductVariant,
    targetIndex?: number,
  ) => {
    // Add to local products list so it appears in search
    setNewProducts((prev) => [...prev, newVariant]);
    // Auto-select in the target line item
    const idx = targetIndex ?? fields.length - 1;
    if (idx >= 0 && idx < fields.length) {
      selectProduct(idx, newVariant);
    }
  };

  const CUSTOM_ITEM_PREFIX = "custom:";

  const confirmCustomItem = () => {
    if (!customItemName.trim() || customItemIndex === null) return;
    const tempId = `${CUSTOM_ITEM_PREFIX}${Date.now()}`;
    const price = Number(customItemPrice) || 0;

    // Add to customItems list
    setCustomItems((prev) => [
      ...prev,
      { tempId, name: customItemName.trim(), sellPrice: price },
    ]);

    // Set the productVariantId in the form
    form.setValue(`items.${customItemIndex}.productVariantId`, tempId);
    form.setValue(`items.${customItemIndex}.unitPrice`, price);

    // Reset inline form
    setCustomItemIndex(null);
    setCustomItemName("");
    setCustomItemPrice("");
  };

  const totals = computeOrderTotals(watchItems || []);

  const {
    execute: submitAction,
    isPending: isSubmitting,
    error: actionError,
  } = useAction(
    async (data: SalesOrderFormValues) => {
      const values =
        mode === "create"
          ? (data as CreateSalesOrderValues)
          : ({ ...data, id: initialData!.id } as UpdateSalesOrderValues);

      return mode === "create"
        ? await createSalesOrder(values as CreateSalesOrderValues)
        : await updateSalesOrder(values as UpdateSalesOrderValues);
    },
    {
      form,
      successMessage: `Sales Order ${mode === "create" ? "Created" : "Updated"}`,
      onSuccess: () => router.push("/sales"),
    },
  );

  function normalizeFormDataForSubmit(
    data: SalesOrderFormValues,
  ): SalesOrderFormValues {
    return {
      ...data,
      customItems: customItems.length > 0 ? customItems : undefined,
      items: data.items.map((item) => {
        // Skip normalization for custom items (they don't have real variants yet)
        if (item.productVariantId.startsWith(CUSTOM_ITEM_PREFIX)) {
          return {
            ...item,
            enteredQuantity: undefined,
            enteredUnit: undefined,
            conversionFactorSnapshot: undefined,
            enteredUnitPrice: undefined,
          };
        }

        const variant = products.find((p) => p.id === item.productVariantId);
        if (!variant) return item;

        const meta = getProductionUnitMeta(variant);
        if (!meta.hasAlternateUnit) {
          return {
            ...item,
            enteredQuantity: undefined,
            enteredUnit: undefined,
            conversionFactorSnapshot: undefined,
            enteredUnitPrice: undefined,
          };
        }

        const enteredQuantity = Number(item.quantity);
        const enteredUnitPrice = Number(item.unitPrice);
        const baseQuantity = toBaseQuantity(
          enteredQuantity,
          meta.conversionFactor,
        );
        const baseUnitPrice = enteredUnitPrice / meta.conversionFactor;

        return {
          ...item,
          quantity: baseQuantity,
          unitPrice: baseUnitPrice,
          enteredQuantity,
          enteredUnit: meta.salesUnit as Unit,
          conversionFactorSnapshot: meta.conversionFactor,
          enteredUnitPrice,
        };
      }),
    };
  }

  async function onSubmit(data: SalesOrderFormValues) {
    if (mode === "edit") {
      const confirmed = window.confirm(
        "Apakah Anda yakin ingin menyimpan perubahan pada Sales Order ini? Perubahan harga/qty akan mempengaruhi total dan jurnal yang sudah terbentuk.",
      );
      if (!confirmed) return;
    }
    await submitAction(normalizeFormDataForSubmit(data));
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <ErrorAlert error={actionError} />

        {mode === "edit" && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <AlertTitle>⚠️ Mode Edit Sales Order</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Harga satuan tidak bisa diubah jika sudah ada invoice</li>
                <li>
                  Qty tidak bisa dikurangi di bawah jumlah yang sudah dikirim
                </li>
                <li>Perubahan akan memperbarui total dan jurnal</li>
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertTitle>Sales Order untuk kebutuhan customer</AlertTitle>
          <AlertDescription>
            Gunakan Sales Order untuk transaksi customer, baik dipenuhi dari
            stok maupun made to order. Jika tujuan order hanya untuk build stock
            internal, gunakan Production Order dari menu Planning.
          </AlertDescription>
        </Alert>

        {/* Header Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => {
              const selectedCustomer = customers.find(
                (c) => c.id === field.value,
              );
              const isOverLimit =
                selectedCustomer?.creditLimit &&
                selectedCustomer.creditLimit < totals.net;

              return (
                <FormItem className="flex flex-col">
                  <FormLabel>{salesLabels.customer}</FormLabel>
                  <Popover open={openCustomer} onOpenChange={setOpenCustomer}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground",
                            isOverLimit &&
                              "border-red-500 bg-red-50 text-red-900",
                          )}
                        >
                          {field.value
                            ? customers.find(
                                (customer) => customer.id === field.value,
                              )?.name
                            : "Pilih customer"}
                          <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <Command>
                        <CommandInput placeholder="Cari customer..." />
                        <CommandList>
                          <CommandEmpty>Customer tidak ditemukan.</CommandEmpty>
                          <CommandGroup>
                            {customers.map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.name}
                                onSelect={() => {
                                  form.setValue("customerId", customer.id);
                                  setOpenCustomer(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    customer.id === field.value
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                {customer.name}
                                {!!customer.creditLimit && (
                                  <span className="ml-auto text-xs text-muted-foreground">
                                    Limit: {formatRupiah(customer.creditLimit)}
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Customer tetap wajib diisi. Jika tujuan order hanya build
                    stock internal, gunakan Production Order manual.
                  </FormDescription>
                  {!!selectedCustomer?.creditLimit && (
                    <div
                      className={cn(
                        "text-xs flex justify-between",
                        isOverLimit
                          ? "text-red-500 font-medium"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>
                        Limit: {formatRupiah(selectedCustomer.creditLimit)}
                      </span>
                      {isOverLimit && <span>Exceeds Limit!</span>}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Source Location */}
          <FormField
            control={form.control}
            name="sourceLocationId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{sourceLocationLabel}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={sourceLocationPlaceholder} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {selectableLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{sourceLocationDescription}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Order Type */}
          <FormField
            control={form.control}
            name="orderType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{salesLabels.orderType}</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value || "MAKE_TO_STOCK"}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Pilih tipe order" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MAKE_TO_STOCK">
                      Make to Stock (MTS)
                    </SelectItem>
                    <SelectItem value="MAKE_TO_ORDER">
                      Make to Order (MTO)
                    </SelectItem>
                    <SelectItem value="MAKLON_JASA">Maklon Jasa</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Make to Stock berarti order customer dipenuhi dari stok lebih
                  dulu. Make to Order berarti demand langsung memicu produksi
                  berdasarkan pesanan. Maklon Jasa dipakai untuk jasa berbasis
                  bahan titipan customer; item sales harus service dan konsumsi
                  bahan terjadi di Production Execution, bukan shipment sales
                  biasa.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Order Date */}
          <FormField
            control={form.control}
            name="orderDate"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{salesLabels.orderDate}</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground",
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pilih tanggal</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => {
                        const maxDate = new Date();
                        maxDate.setHours(23, 59, 59, 999);
                        // Allow selection up to end of today, but maybe also allow some future dates if order can be backdated/postdated?
                        // User mentioned they couldn't change month, which might be because they were trying to select a different month but arrows weren't working.
                        // Let's allow a wider range for order date if needed, or just fix the UI.
                        return date < new Date("1900-01-01") || date > maxDate;
                      }}
                      captionLayout="dropdown"
                      fromYear={2000}
                      toYear={new Date().getFullYear() + 1}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Expected Date */}
          {selectedOrderType !== "MAKE_TO_STOCK" && (
            <FormField
              control={form.control}
              name="expectedDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>{salesLabels.expectedDate}</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground",
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pilih tanggal</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value as Date} // Type assertion since expectedDate can be null
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date("1900-01-01")}
                        captionLayout="dropdown"
                        fromYear={2000}
                        toYear={new Date().getFullYear() + 10}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{formLabels.notes}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Catatan opsional..."
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Line Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {salesLabels.items} Pesanan
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({
                  productVariantId: "",
                  quantity: 1,
                  unitPrice: 0,
                  discountPercent: 0,
                  taxPercent: 0,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" /> {actionLabels.add} Item
            </Button>
          </div>

          {selectedOrderType === "MAKLON_JASA" && (
            <p className="text-sm text-muted-foreground">
              Maklon Jasa hanya menampilkan service item. Barang fisik di Maklon
              Packing Area tetap dikonsumsi saat production execution.
            </p>
          )}

          {/* Desktop: Table view */}
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  <th className="h-10 px-4 text-left font-medium w-[300px]">
                    {formLabels.product}
                  </th>
                  <th className="h-10 px-4 text-left font-medium w-[120px]">
                    {formLabels.qty}
                  </th>
                  <th className="h-10 px-4 text-left font-medium w-[150px]">
                    {formLabels.unitPrice}
                  </th>
                  <th className="h-10 px-4 text-left font-medium w-[100px]">
                    Diskon %
                  </th>
                  <th className="h-10 px-4 text-left font-medium w-[100px]">
                    Pajak %
                  </th>
                  <th className="h-10 px-4 text-right font-medium w-[150px]">
                    {formLabels.subtotal}
                  </th>
                  <th className="h-10 px-4 w-[50px]"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => (
                  <tr
                    key={field.id}
                    className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-2 align-middle">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productVariantId`}
                        render={({ field, fieldState }) => (
                          <div className="flex items-center gap-2">
                            <Popover
                              open={openProduct[index]}
                              onOpenChange={(open) =>
                                setOpenProduct((prev) => ({
                                  ...prev,
                                  [index]: open,
                                }))
                              }
                            >
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="ghost"
                                    role="combobox"
                                    className={cn(
                                      "w-[300px] justify-between border-0 shadow-none bg-transparent h-auto p-2 font-medium hover:bg-muted/50",
                                      !field.value && "text-muted-foreground",
                                    )}
                                  >
                                    <div className="truncate text-left">
                                      {field.value
                                        ? field.value.startsWith(
                                            CUSTOM_ITEM_PREFIX,
                                          )
                                          ? (() => {
                                              const custom = customItems.find(
                                                (c) => c.tempId === field.value,
                                              );
                                              return custom
                                                ? `✏️ ${custom.name}`
                                                : "Pilih Produk";
                                            })()
                                          : (() => {
                                              const p = filteredProducts.find(
                                                (p: SerializedProductVariant) =>
                                                  p.id === field.value,
                                              );
                                              return p
                                                ? p.product.name === p.name
                                                  ? p.name
                                                  : `${p.product.name} - ${p.name}`
                                                : "Pilih Produk";
                                            })()
                                        : "Pilih Produk"}
                                    </div>
                                    <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-[400px] p-0"
                                align="start"
                              >
                                <Command>
                                  <CommandInput placeholder="Cari produk..." />
                                  <CommandList>
                                    <CommandEmpty>
                                      {productEmptyMessage}
                                    </CommandEmpty>
                                    <CommandGroup>
                                      {filteredProducts.map(
                                        (p: SerializedProductVariant) => (
                                          <CommandItem
                                            key={p.id}
                                            value={`${p.product.name} ${p.name} ${p.skuCode}`.toLowerCase()}
                                            onSelect={() => {
                                              selectProduct(index, p);
                                              setOpenProduct((prev) => ({
                                                ...prev,
                                                [index]: false,
                                              }));
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                p.id === field.value
                                                  ? "opacity-100"
                                                  : "opacity-0",
                                              )}
                                            />
                                            <div className="flex flex-col">
                                              <span>
                                                {p.product.name === p.name
                                                  ? p.name
                                                  : `${p.product.name} - ${p.name}`}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {p.skuCode} •{" "}
                                                {formatRupiah(
                                                  toDisplayUnitPrice(
                                                    p,
                                                    p.sellPrice || 0,
                                                  ),
                                                )}
                                                /
                                                {
                                                  getProductionUnitMeta(p)
                                                    .displayUnit
                                                }
                                              </span>
                                            </div>
                                          </CommandItem>
                                        ),
                                      )}
                                    </CommandGroup>
                                    <CommandSeparator />
                                    <CommandGroup>
                                      <CommandItem
                                        onSelect={() => {
                                          setOpenProduct((prev) => ({
                                            ...prev,
                                            [index]: false,
                                          }));
                                          setCustomItemIndex(index);
                                        }}
                                        className="flex items-center gap-2 text-amber-600 cursor-pointer"
                                      >
                                        <span className="text-lg leading-none">
                                          ✏️
                                        </span>
                                        <span className="font-medium">
                                          Ketik Nama Produk Sendiri
                                        </span>
                                      </CommandItem>
                                      <CommandItem
                                        onSelect={() => {
                                          setOpenProduct((prev) => ({
                                            ...prev,
                                            [index]: false,
                                          }));
                                          setQuickAddIndex(index);
                                        }}
                                        className="flex items-center gap-2 text-primary cursor-pointer"
                                      >
                                        <Plus className="h-4 w-4" />
                                        <span className="font-medium">
                                          Tambah Produk Baru
                                        </span>
                                      </CommandItem>
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                            {fieldState.error && (
                              <span className="text-xs text-destructive whitespace-nowrap">
                                {fieldState.error.message}
                              </span>
                            )}
                          </div>
                        )}
                      />
                    </td>
                    <td className="p-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                className="border-0 shadow-none bg-transparent h-11 p-2"
                                {...field}
                              />
                            </FormControl>
                            {getLineUnitMeta(index) && (
                              <FormDescription className="px-2 text-[10px]">
                                {getLineUnitMeta(index)?.displayUnit}
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>
                    <td className="p-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                step="100"
                                className="border-0 shadow-none bg-transparent h-11 p-2"
                                {...field}
                              />
                            </FormControl>
                            {getLineUnitMeta(index) && (
                              <FormDescription className="px-2 text-[10px]">
                                per {getLineUnitMeta(index)?.displayUnit}
                              </FormDescription>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>
                    <td className="p-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.discountPercent`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                placeholder="0"
                                className="border-0 shadow-none bg-transparent h-11 p-2"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>
                    <td className="p-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.taxPercent`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                placeholder="0"
                                className="border-0 shadow-none bg-transparent h-11 p-2"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </td>
                    <td className="p-4 text-right tabular-nums">
                      {(() => {
                        const item = watchItems?.[index];
                        const qty = item?.quantity || 0;
                        const price = item?.unitPrice || 0;
                        const disc = item?.discountPercent || 0;
                        const tax = item?.taxPercent || 0;

                        const sub = qty * price;
                        const afterDisc = sub - sub * (disc / 100);
                        const total = afterDisc + afterDisc * (tax / 100);

                        return formatRupiah(total);
                      })()}
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-11 w-11 text-muted-foreground hover:text-red-500"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/50 font-medium">
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-right text-muted-foreground"
                  >
                    {formLabels.subtotal}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatRupiah(totals.gross)}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-right text-muted-foreground"
                  >
                    Diskon
                  </td>
                  <td className="px-4 py-2 text-right text-red-500">
                    -{formatRupiah(totals.discount)}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-right text-muted-foreground"
                  >
                    Pajak
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatRupiah(totals.tax)}
                  </td>
                  <td></td>
                </tr>
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-2 text-right text-muted-foreground"
                  >
                    Ongkos Kirim
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Input
                      type="number"
                      min={0}
                      {...form.register("shippingCost", {
                        valueAsNumber: true,
                      })}
                      className="w-32 text-right ml-auto h-11"
                      placeholder="0"
                    />
                  </td>
                  <td></td>
                </tr>
                <tr className="border-t border-muted-foreground/20">
                  <td
                    colSpan={5}
                    className="px-4 py-3 text-right text-lg font-bold"
                  >
                    Total Keseluruhan
                  </td>
                  <td className="px-4 py-3 text-right text-lg font-bold">
                    {formatRupiah(totals.net + watchShippingCost)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile: Card view */}
          <div className="md:hidden space-y-3">
            {fields.map((field, index) => {
              const item = watchItems?.[index];
              const qty = item?.quantity || 0;
              const price = item?.unitPrice || 0;
              const disc = item?.discountPercent || 0;
              const tax = item?.taxPercent || 0;
              const sub = qty * price;
              const afterDisc = sub - sub * (disc / 100);
              const lineTotal = afterDisc + afterDisc * (tax / 100);
              const variant = getLineVariant(index);
              const unitMeta = getLineUnitMeta(index);

              return (
                <div
                  key={field.id}
                  className="border rounded-lg p-4 space-y-3 bg-card"
                >
                  {/* Product header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productVariantId`}
                        render={({ field: productField }) => (
                          <Button
                            type="button"
                            variant="outline"
                            className={cn(
                              "w-full justify-between h-11 text-left font-normal",
                              !productField.value && "text-muted-foreground",
                            )}
                            onClick={() =>
                              setMobileProductSearch({
                                open: true,
                                index,
                              })
                            }
                          >
                            <span className="truncate">
                              {productField.value
                                ? productField.value.startsWith(
                                    CUSTOM_ITEM_PREFIX,
                                  )
                                  ? (() => {
                                      const custom = customItems.find(
                                        (c) => c.tempId === productField.value,
                                      );
                                      return custom
                                        ? `✏️ ${custom.name}`
                                        : "Pilih Produk";
                                    })()
                                  : (() => {
                                      const p = filteredProducts.find(
                                        (pv: SerializedProductVariant) =>
                                          pv.id === productField.value,
                                      );
                                      return p
                                        ? p.product.name === p.name
                                          ? p.name
                                          : `${p.product.name} - ${p.name}`
                                        : "Pilih Produk";
                                    })()
                                : "Pilih Produk"}
                            </span>
                            <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        )}
                      />
                      {variant && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {variant.skuCode}
                          {unitMeta?.hasAlternateUnit &&
                            ` • ${unitMeta.displayUnit}`}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-11 w-11 text-muted-foreground hover:text-red-500 shrink-0"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Qty & Price */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field: qtyField }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Qty{unitMeta ? ` (${unitMeta.displayUnit})` : ""}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              className="h-11"
                              {...qtyField}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.unitPrice`}
                      render={({ field: priceField }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Harga{unitMeta ? ` /${unitMeta.displayUnit}` : ""}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="100"
                              className="h-11"
                              {...priceField}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Discount & Tax */}
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.discountPercent`}
                      render={({ field: discField }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Diskon %
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              placeholder="0"
                              className="h-11"
                              {...discField}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`items.${index}.taxPercent`}
                      render={({ field: taxField }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-muted-foreground">
                            Pajak %
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              placeholder="0"
                              className="h-11"
                              {...taxField}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Subtotal */}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm text-muted-foreground">
                      Subtotal
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatRupiah(lineTotal)}
                    </span>
                  </div>
                </div>
              );
            })}

            {fields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm border border-dashed rounded-lg">
                Belum ada item. Klik &quot;Tambah Item&quot; untuk menambahkan
                produk.
              </div>
            )}

            {/* Mobile totals */}
            {fields.length > 0 && (
              <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums">
                    {formatRupiah(totals.gross)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Diskon</span>
                  <span className="text-red-500 tabular-nums">
                    -{formatRupiah(totals.discount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pajak</span>
                  <span className="tabular-nums">
                    {formatRupiah(totals.tax)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Ongkos Kirim</span>
                  <Input
                    type="number"
                    min={0}
                    {...form.register("shippingCost", {
                      valueAsNumber: true,
                    })}
                    className="w-28 text-right h-11"
                    placeholder="0"
                  />
                </div>
                <div className="flex justify-between items-center pt-2 border-t font-bold text-lg">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatRupiah(totals.net + watchShippingCost)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Button variant="outline" type="button" onClick={() => router.back()}>
            {actionLabels.cancel}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "create"
              ? `${actionLabels.create} Order`
              : `${actionLabels.update} Order`}
          </Button>
        </div>
      </form>

      {/* Inline Custom Item Form */}
      {customItemIndex !== null && (
        <Dialog
          open={customItemIndex !== null}
          onOpenChange={(open) => {
            if (!open) {
              setCustomItemIndex(null);
              setCustomItemName("");
              setCustomItemPrice("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ketik Nama Produk</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="custom-item-name">Nama Produk *</Label>
                <Input
                  id="custom-item-name"
                  value={customItemName}
                  onChange={(e) => setCustomItemName(e.target.value)}
                  placeholder="Contoh: Plastik OPP 8 micron"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customItemName.trim()) {
                      e.preventDefault();
                      confirmCustomItem();
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-item-price">Harga (Rp)</Label>
                <Input
                  id="custom-item-price"
                  type="number"
                  min="0"
                  step="100"
                  value={customItemPrice}
                  onChange={(e) => setCustomItemPrice(e.target.value)}
                  placeholder="0 (harga nego, bisa diisi nanti)"
                />
                <p className="text-xs text-muted-foreground">
                  Kosongkan atau isi 0 jika harga masih nego. Bisa diubah
                  setelah order dibuat.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCustomItemIndex(null);
                    setCustomItemName("");
                    setCustomItemPrice("");
                  }}
                >
                  Batal
                </Button>
                <Button
                  onClick={confirmCustomItem}
                  disabled={!customItemName.trim()}
                >
                  Pilih Produk Ini
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Quick Add Product Dialog */}
      <QuickProductDialog
        onProductCreated={(variant) => {
          handleQuickProductCreated(
            variant as SerializedProductVariant,
            quickAddIndex ?? undefined,
          );
          setQuickAddIndex(null);
        }}
      />

      {/* Mobile product search dialog */}
      <Dialog
        open={mobileProductSearch.open}
        onOpenChange={(open) =>
          setMobileProductSearch((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="p-0 max-w-none sm:max-w-lg h-[90vh] flex flex-col">
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Pilih Produk</DialogTitle>
          </DialogHeader>
          <Command className="flex-1 overflow-hidden">
            <CommandInput placeholder="Cari nama, SKU, atau kode produk..." />
            <CommandList className="flex-1 overflow-y-auto">
              <CommandEmpty>{productEmptyMessage}</CommandEmpty>
              <CommandGroup>
                {filteredProducts.map((p: SerializedProductVariant) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.product.name} ${p.name} ${p.skuCode}`.toLowerCase()}
                    onSelect={() => {
                      selectProduct(mobileProductSearch.index, p);
                      setMobileProductSearch({ open: false, index: 0 });
                    }}
                    className="py-3"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        p.id ===
                          form.getValues(
                            `items.${mobileProductSearch.index}.productVariantId`,
                          )
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {p.product.name === p.name
                          ? p.name
                          : `${p.product.name} - ${p.name}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.skuCode} •{" "}
                        {formatRupiah(toDisplayUnitPrice(p, p.sellPrice || 0))}/
                        {getProductionUnitMeta(p).displayUnit}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    const idx = mobileProductSearch.index;
                    setMobileProductSearch({ open: false, index: 0 });
                    setCustomItemIndex(idx);
                  }}
                  className="flex items-center gap-2 text-amber-600 cursor-pointer py-3"
                >
                  <span className="text-lg leading-none">✏️</span>
                  <span className="font-medium">Ketik Nama Produk Sendiri</span>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    const idx = mobileProductSearch.index;
                    setMobileProductSearch({ open: false, index: 0 });
                    setQuickAddIndex(idx);
                  }}
                  className="flex items-center gap-2 text-primary cursor-pointer py-3"
                >
                  <Plus className="h-4 w-4" />
                  <span className="font-medium">Tambah Produk Baru</span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </Form>
  );
}
