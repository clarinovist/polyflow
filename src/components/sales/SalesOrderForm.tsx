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
import { Checkbox } from "@/components/ui/checkbox";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatRupiah } from "@/lib/utils/utils";
import { calculatePpn, type PpnMode } from "@/lib/utils/ppn";
import { parseIndonesianPrice, formatIndonesianPrice } from "@/lib/utils/price-format";
import { CalendarIcon, Plus, Trash2, Loader2, Check, Info, Settings } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { CustomerDialog } from "@/components/customers/CustomerDialog";

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
  const [openNewCustomer, setOpenNewCustomer] = useState(false);
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
  // Track raw input values for price fields (to allow typing commas/dots)
  const [rawPriceInputs, setRawPriceInputs] = useState<Record<number, string>>({});
  // Track raw input values for qty fields (to allow empty during editing)
  const [rawQtyInputs, setRawQtyInputs] = useState<Record<number, string>>({});
  const [discountTypes, setDiscountTypes] = useState<Record<number, 'PERCENT' | 'NOMINAL'>>(() => {
    let itemsToProcess: { discountPercent?: number }[] = [];
    if (initialData?.items) {
      itemsToProcess = initialData.items as Record<string, unknown>[];
    } else if (reorderData?.items) {
      itemsToProcess = reorderData.items;
    }
    const typesMap: Record<number, 'PERCENT' | 'NOMINAL'> = {};
    itemsToProcess.forEach((_, i) => {
      typesMap[i] = 'PERCENT';
    });
    return typesMap;
  });
  const [rawDiscountInputs, setRawDiscountInputs] = useState<Record<number, string>>(() => {
    let itemsToProcess: { discountPercent?: number }[] = [];
    if (initialData?.items) {
      itemsToProcess = initialData.items as Record<string, unknown>[];
    } else if (reorderData?.items) {
      itemsToProcess = reorderData.items;
    }
    const inputsMap: Record<number, string> = {};
    itemsToProcess.forEach((item, i) => {
      const percent = Number(item.discountPercent || 0);
      if (percent > 0) {
        inputsMap[i] = String(Math.round(percent * 1000000) / 1000000);
      }
    });
    return inputsMap;
  });
  const previousCustomerIdRef = useRef<string | undefined>(
    initialData
      ? ((initialData as Record<string, unknown>).customerId as string | undefined)
      : reorderData?.customerId,
  );

  // Track which items have "Kena Pajak" checked (controls Pajak/DPP visibility)
  const [taxableItems, setTaxableItems] = useState<Record<number, boolean>>(() => {
    if (initialData) {
      const items = (initialData as Record<string, unknown>).items as
        | { taxPercent?: number }[]
        | undefined;
      if (items) {
        const map: Record<number, boolean> = {};
        items.forEach((item, i) => {
          map[i] = (item.taxPercent ?? 0) > 0;
        });
        return map;
      }
    }
    return { 0: false };
  });

  // Filter locations for stock-based sales fulfillment
  // Uses locationPurpose for proper categorization (FINISHED_GOOD, PACKING, GENERAL_PURPOSE, RAW_MATERIAL, SCRAP)
  // Previously filtered by slug keywords which broke tenants with simpler warehouse names.
  const stockFulfillmentLocations = locations.filter(
    (l) => l.locationType !== "CUSTOMER_OWNED" &&
      ["FINISHED_GOOD", "PACKING", "GENERAL_PURPOSE", "RAW_MATERIAL", "SCRAP"].includes(l.locationPurpose),
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
      dppOtherAmount?: number | null;
      ppnMode?: 'INCLUDE' | 'EXCLUDE';
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
              ppnMode: 'EXCLUDE' as 'INCLUDE' | 'EXCLUDE',
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
                dppOtherAmount: null,
                ppnMode: 'EXCLUDE' as 'INCLUDE' | 'EXCLUDE',
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
  const selectedCustomerId = useWatch({
    control: form.control,
    name: "customerId",
  });

  const selectableLocations =
    selectedOrderType === "MAKLON_JASA"
      ? maklonProductionLocations
      : stockFulfillmentLocations;

  const isLocationRequired = selectedOrderType === "MAKLON_JASA";

  const productEmptyMessage =
    selectedOrderType === "MAKLON_JASA"
      ? "Tidak ada service item untuk Maklon Jasa. Stok fisik di Maklon Packing Area dipakai saat production execution, bukan dipilih sebagai item sales."
      : "Tidak ada produk ditemukan.";

  const sourceLocationLabel =
    selectedOrderType === "MAKLON_JASA"
      ? salesLabels.customerWarehouse
      : `${salesLabels.sourceWarehouse} (Opsional)`;

  const sourceLocationPlaceholder =
    selectedOrderType === "MAKLON_JASA"
      ? "Pilih gudang customer"
      : "Pilih gudang (opsional)";

  const sourceLocationDescription =
    selectedOrderType === "MAKLON_JASA"
      ? "Untuk Maklon Jasa, field ini harus memakai warehouse customer-owned. Lokasi ini menjadi default sumber bahan titipan customer untuk flow maklon, lalu Production Execution tetap memprioritaskan stok yang sudah dipindah ke lokasi proses jika ada."
      : "Bisa dikosongkan untuk order cepat. Pilih gudang saat ingin reservasi stok atau kirim barang.";

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

    // For MTS, show all products — stock validation happens at fulfillment time.
    // This allows selling raw materials (barter) even if stock shows 0 in UI.
    return baseProducts;
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

  // Adjust discount percents when subtotal changes for NOMINAL discounts
  useEffect(() => {
    if (!watchItems) return;
    const items = form.getValues("items") || [];
    items.forEach((item, index) => {
      const type = discountTypes[index];
      if (type === 'NOMINAL') {
        const rawInput = rawDiscountInputs[index] || '';
        const nominal = rawInput ? parseIndonesianPrice(rawInput) : 0;
        const qty = Number(item.quantity || 0);
        const price = Number(item.unitPrice || 0);
        const subtotal = qty * price;
        const calculatedPercent = subtotal > 0 ? (nominal / subtotal) * 100 : 0;
        
        const currentPercent = Number(item.discountPercent || 0);
        if (Math.abs(currentPercent - calculatedPercent) > 0.000001) {
          form.setValue(`items.${index}.discountPercent`, calculatedPercent, { shouldDirty: false });
        }
      }
    });
  }, [watchItems, discountTypes, rawDiscountInputs, form]);

  // Auto-calculate DPPnya = DPP × 11/12 when qty, price, or discount changes
  useEffect(() => {
    const items = form.getValues("items") || [];
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
  }, [watchItems, form]);

  const handleRemoveItem = (index: number) => {
    remove(index);
    setTaxableItems(prev => {
      const newMap: Record<number, boolean> = {};
      Object.keys(prev)
        .map(Number)
        .sort((a, b) => a - b)
        .filter(i => i !== index)
        .forEach((oldIdx, newIdx) => {
          newMap[newIdx] = prev[oldIdx];
        });
      return newMap;
    });
    setDiscountTypes(prev => {
      const newMap: Record<number, 'PERCENT' | 'NOMINAL'> = {};
      Object.keys(prev)
        .map(Number)
        .sort((a, b) => a - b)
        .filter(i => i !== index)
        .forEach((oldIdx, newIdx) => {
          newMap[newIdx] = prev[oldIdx];
        });
      return newMap;
    });
    setRawDiscountInputs(prev => {
      const newMap: Record<number, string> = {};
      Object.keys(prev)
        .map(Number)
        .sort((a, b) => a - b)
        .filter(i => i !== index)
        .forEach((oldIdx, newIdx) => {
          newMap[newIdx] = prev[oldIdx];
        });
      return newMap;
    });
  };

  const toggleDiscountType = (index: number) => {
    const currentType = discountTypes[index] || 'PERCENT';
    const nextType = currentType === 'PERCENT' ? 'NOMINAL' : 'PERCENT';
    
    const currentPercent = Number(form.getValues(`items.${index}.discountPercent`) || 0);
    const qty = Number(form.getValues(`items.${index}.quantity`) || 0);
    const price = Number(form.getValues(`items.${index}.unitPrice`) || 0);
    const subtotal = qty * price;

    let nextValueString = '';

    if (nextType === 'NOMINAL') {
      const nominal = subtotal * (currentPercent / 100);
      nextValueString = nominal > 0 ? String(Math.round(nominal)) : '';
    } else {
      const rawInput = rawDiscountInputs[index] || '';
      const nominal = rawInput ? parseIndonesianPrice(rawInput) : (subtotal * (currentPercent / 100));
      const percent = subtotal > 0 ? (nominal / subtotal) * 100 : 0;
      nextValueString = percent > 0 ? String(Math.round(percent * 1000000) / 1000000) : '';
    }

    setDiscountTypes(prev => ({ ...prev, [index]: nextType }));
    
    if (nextValueString) {
      setRawDiscountInputs(prev => ({ 
        ...prev, 
        [index]: nextType === 'NOMINAL' ? formatIndonesianPrice(Number(nextValueString)) : nextValueString 
      }));
      const val = Number(nextValueString);
      if (nextType === 'NOMINAL') {
        const calculatedPercent = subtotal > 0 ? (val / subtotal) * 100 : 0;
        form.setValue(`items.${index}.discountPercent`, calculatedPercent, { shouldDirty: true });
      } else {
        form.setValue(`items.${index}.discountPercent`, val, { shouldDirty: true });
      }
    } else {
      setRawDiscountInputs(prev => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      form.setValue(`items.${index}.discountPercent`, 0, { shouldDirty: true });
    }
  };

  const handleDiscountChange = (index: number, valStr: string) => {
    setRawDiscountInputs(prev => ({ ...prev, [index]: valStr }));
    
    const type = discountTypes[index] || 'PERCENT';
    const qty = Number(form.getValues(`items.${index}.quantity`) || 0);
    const price = Number(form.getValues(`items.${index}.unitPrice`) || 0);
    const subtotal = qty * price;

    if (!valStr) {
      form.setValue(`items.${index}.discountPercent`, 0, { shouldDirty: true });
      return;
    }

    if (type === 'NOMINAL') {
      const nominal = parseIndonesianPrice(valStr);
      const calculatedPercent = subtotal > 0 ? (nominal / subtotal) * 100 : 0;
      form.setValue(`items.${index}.discountPercent`, calculatedPercent, { shouldDirty: true });
    } else {
      const percent = Number(valStr);
      form.setValue(`items.${index}.discountPercent`, percent, { shouldDirty: true });
    }
  };

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

  const getCustomerBasePrice = useCallback((variant: SerializedProductVariant) => {
    const customerPrice = selectedCustomerId
      ? variant.customerPrices?.find(
          (price) => price.customerId === selectedCustomerId && price.isActive,
        )
      : undefined;
    return customerPrice?.unitPrice ?? variant.sellPrice ?? variant.price ?? 0;
  }, [selectedCustomerId]);

  const getPriceSourceLabel = useCallback((variant: SerializedProductVariant) => {
    if (!selectedCustomerId) return "Harga default";
    return variant.customerPrices?.some(
      (price) => price.customerId === selectedCustomerId && price.isActive,
    )
      ? "Harga khusus customer"
      : "Harga default";
  }, [selectedCustomerId]);

  const selectProduct = (index: number, variant: SerializedProductVariant) => {
    form.setValue(`items.${index}.productVariantId`, variant.id);
    form.setValue(
      `items.${index}.unitPrice`,
      toDisplayUnitPrice(variant, getCustomerBasePrice(variant)),
    );
  };

  useEffect(() => {
    const previousCustomerId = previousCustomerIdRef.current;
    previousCustomerIdRef.current = selectedCustomerId;

    if (!previousCustomerId || previousCustomerId === selectedCustomerId) {
      return;
    }

    const items = form.getValues("items");
    const hasProducts = items.some((item) => item.productVariantId);
    if (!hasProducts) return;

    const shouldUpdate = window.confirm(
      "Customer berubah. Update harga item sesuai harga customer baru?",
    );
    if (!shouldUpdate) return;

    items.forEach((item, index) => {
      const variant = products.find((p) => p.id === item.productVariantId);
      if (!variant) return;
      form.setValue(
        `items.${index}.unitPrice`,
        toDisplayUnitPrice(variant, getCustomerBasePrice(variant)),
        { shouldDirty: true, shouldValidate: true },
      );
    });
  }, [selectedCustomerId, form, products, getCustomerBasePrice]);

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
          <AlertTitle>Sales Order untuk pesanan customer</AlertTitle>
          <AlertDescription>
            Untuk build stock internal, gunakan Production Order di menu
            Planning.
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
                          <CommandSeparator />
                          <CommandGroup>
                            <CommandItem
                              onSelect={() => {
                                setOpenCustomer(false);
                                setOpenNewCustomer(true);
                              }}
                              className="cursor-pointer text-blue-600"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Tambah Customer Baru
                            </CommandItem>
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Wajib diisi untuk Sales Order customer.
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
                  onValueChange={(value) => {
                    // "none" sentinel means no location selected
                    field.onChange(value === "__none__" ? "" : value);
                  }}
                  value={field.value || "__none__"}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={sourceLocationPlaceholder} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {!isLocationRequired && (
                      <SelectItem value="__none__">
                        <span className="text-muted-foreground italic">Semua gudang</span>
                      </SelectItem>
                    )}
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
                <FormLabel className="flex items-center gap-1.5">
                  {salesLabels.orderType}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        aria-label="Penjelasan tipe pesanan"
                        className="inline-flex cursor-help text-muted-foreground hover:text-foreground"
                        tabIndex={0}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-left leading-relaxed">
                      <p>MTS: dipenuhi dari stok tersedia.</p>
                      <p>MTO: produksi berdasarkan pesanan.</p>
                      <p>
                        Maklon Jasa: jasa berbasis bahan titipan customer;
                        konsumsi bahan lewat Production Execution.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
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
                  Pilih alur pemenuhan order.
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
                {
                  const newIndex = fields.length;
                  setTaxableItems((prev) => ({ ...prev, [newIndex]: false }));
                  setDiscountTypes((prev) => ({ ...prev, [newIndex]: 'PERCENT' }));
                  append({
                    productVariantId: "",
                    quantity: 1,
                    unitPrice: 0,
                    discountPercent: 0,
                    taxPercent: 0,
                    dppOtherAmount: null,
                    ppnMode: 'EXCLUDE' as 'INCLUDE' | 'EXCLUDE',
                  });
                }
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

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="bg-zinc-50 dark:bg-zinc-900">
                <TableRow>
                  <TableHead className="w-[50px] text-center">#</TableHead>
                  <TableHead className="min-w-[250px]">Produk</TableHead>
                  <TableHead className="w-[150px] px-2 text-center">Qty</TableHead>
                  <TableHead className="w-[180px] text-right">Harga Satuan</TableHead>
                  <TableHead className="w-[120px] px-2 text-right">Diskon</TableHead>
                  <TableHead className="w-[110px] text-center">Pajak</TableHead>
                  <TableHead className="w-[160px] text-right">Subtotal</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field, index) => {
                  const item = watchItems?.[index];
                  const qty = item?.quantity || 0;
                  const price = item?.unitPrice || 0;
                  const disc = item?.discountPercent || 0;
                  const tax = item?.taxPercent || 0;
                  const sub = qty * price;
                  const afterDisc = sub - sub * (disc / 100);
                  const ppnMode = (item?.ppnMode || 'EXCLUDE') as PpnMode;
                  const ppnResult = calculatePpn(afterDisc, tax, ppnMode);
                  const lineTotal = ppnMode === 'INCLUDE' ? ppnResult.dpp : ppnResult.total;
                  const unitMeta = getLineUnitMeta(index);
                  const variant = getLineVariant(index);

                  return (
                    <TableRow key={field.id} className="align-top">
                      <TableCell className="text-center pt-5 font-mono text-sm text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      
                      {/* Produk */}
                      <TableCell className="pt-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.productVariantId`}
                          render={({ field: productField, fieldState }) => (
                            <div className="flex flex-col gap-1">
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
                                      variant="outline"
                                      role="combobox"
                                      className={cn(
                                        "w-full justify-between h-9 px-3 font-normal text-left truncate",
                                        !productField.value && "text-muted-foreground",
                                      )}
                                    >
                                      <div className="truncate text-left flex-1">
                                        {productField.value
                                          ? productField.value.startsWith(CUSTOM_ITEM_PREFIX)
                                            ? (() => {
                                                const custom = customItems.find((c) => c.tempId === productField.value);
                                                return custom ? `✏️ ${custom.name}` : "Pilih Produk";
                                              })()
                                            : (() => {
                                                const p = filteredProducts.find((p) => p.id === productField.value);
                                                return p ? (p.product.name === p.name ? p.name : `${p.product.name} - ${p.name}`) : "Pilih Produk";
                                              })()
                                          : "Pilih Produk"}
                                      </div>
                                      <Check className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0" align="start">
                                  <Command>
                                    <CommandInput placeholder="Cari produk..." />
                                    <CommandList>
                                      <CommandEmpty>{productEmptyMessage}</CommandEmpty>
                                      <CommandGroup>
                                        {filteredProducts.map((p: SerializedProductVariant) => (
                                          <CommandItem
                                            key={p.id}
                                            value={`${p.product.name} ${p.name} ${p.skuCode}`.toLowerCase()}
                                            onSelect={() => {
                                              selectProduct(index, p);
                                              setOpenProduct((prev) => ({ ...prev, [index]: false }));
                                            }}
                                          >
                                            <Check
                                              className={cn(
                                                "mr-2 h-4 w-4",
                                                p.id === productField.value ? "opacity-100" : "opacity-0"
                                              )}
                                            />
                                            <div className="flex flex-col">
                                              <span>
                                                {p.product.name === p.name ? p.name : `${p.product.name} - ${p.name}`}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {p.skuCode} • {formatRupiah(toDisplayUnitPrice(p, getCustomerBasePrice(p)))}/{getProductionUnitMeta(p).displayUnit}
                                                {" · "}{getPriceSourceLabel(p)}
                                              </span>
                                            </div>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                      <CommandSeparator />
                                      <CommandGroup>
                                        <CommandItem
                                          onSelect={() => {
                                            setOpenProduct((prev) => ({ ...prev, [index]: false }));
                                            setCustomItemIndex(index);
                                          }}
                                          className="flex items-center gap-2 text-amber-600 cursor-pointer"
                                        >
                                          <span className="text-lg leading-none">✏️</span>
                                          <span className="font-medium">Ketik Nama Produk Sendiri</span>
                                        </CommandItem>
                                        <CommandItem
                                          onSelect={() => {
                                            setOpenProduct((prev) => ({ ...prev, [index]: false }));
                                            setQuickAddIndex(index);
                                          }}
                                          className="flex items-center gap-2 text-primary cursor-pointer"
                                        >
                                          <Plus className="h-4 w-4" />
                                          <span className="font-medium">Tambah Produk Baru</span>
                                        </CommandItem>
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                              {fieldState.error && (
                                <span className="text-xs text-destructive whitespace-nowrap px-1">
                                  {fieldState.error.message}
                                </span>
                              )}
                            </div>
                          )}
                        />
                        {variant && (
                          <div className="text-[11px] text-muted-foreground mt-1 px-1">
                            {variant.skuCode}
                          </div>
                        )}
                      </TableCell>
                      
                      {/* Qty */}
                      <TableCell className="px-2 pt-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.quantity`}
                          render={({ field: qtyField }) => (
                            <div className="flex flex-col items-center">
                              <FormControl>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  className="h-9 w-full text-center font-mono text-sm px-2 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={rawQtyInputs[index] !== undefined ? rawQtyInputs[index] : (qtyField.value ?? '')}
                                  onChange={(e) => {
                                    setRawQtyInputs(prev => ({ ...prev, [index]: e.target.value }));
                                    const num = Number(e.target.value.replace(',', '.'));
                                    if (!isNaN(num) && e.target.value !== '') {
                                      qtyField.onChange(num);
                                    }
                                  }}
                                  onBlur={() => {
                                    const raw = rawQtyInputs[index];
                                    const num = Number((raw || '0').replace(',', '.'));
                                    qtyField.onChange(isNaN(num) ? 0 : num);
                                    setRawQtyInputs(prev => {
                                      const next = { ...prev };
                                      delete next[index];
                                      return next;
                                    });
                                  }}
                                />
                              </FormControl>
                              {unitMeta && (
                                <span className="text-[10px] text-muted-foreground mt-1 font-medium whitespace-nowrap">
                                  {unitMeta.displayUnit}
                                </span>
                              )}
                            </div>
                          )}
                        />
                      </TableCell>
                      
                      {/* Harga Satuan */}
                      <TableCell className="pt-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.unitPrice`}
                          render={({ field: priceField }) => (
                            <div className="flex flex-col">
                              <FormControl>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                    Rp
                                  </span>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={rawPriceInputs[index] !== undefined ? rawPriceInputs[index] : formatIndonesianPrice(priceField.value ?? 0)}
                                    onChange={(e) => {
                                      setRawPriceInputs(prev => ({ ...prev, [index]: e.target.value }));
                                      const num = parseIndonesianPrice(e.target.value);
                                      priceField.onChange(num);
                                    }}
                                    onBlur={() => {
                                      const num = parseIndonesianPrice(rawPriceInputs[index] || '0');
                                      priceField.onChange(num);
                                      setRawPriceInputs(prev => {
                                        const next = { ...prev };
                                        delete next[index];
                                        return next;
                                      });
                                    }}
                                    className="h-9 pl-7 text-right font-mono text-sm"
                                  />
                                </div>
                              </FormControl>
                              {variant && (
                                <span className="mt-1 text-[10px] text-muted-foreground text-right">
                                  {getPriceSourceLabel(variant)}
                                </span>
                              )}
                            </div>
                          )}
                        />
                      </TableCell>
                      
                      {/* Diskon */}
                      <TableCell className="px-2 pt-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.discountPercent`}
                          render={({ field: discField }) => {
                            const discType = discountTypes[index] || 'PERCENT';
                            const rawVal = rawDiscountInputs[index];
                            
                            let displayValue = '';
                            if (rawVal !== undefined) {
                              displayValue = rawVal;
                            } else {
                              if (discType === 'NOMINAL') {
                                const currentPercent = Number(discField.value || 0);
                                const nominalVal = sub * (currentPercent / 100);
                                displayValue = nominalVal > 0 ? formatIndonesianPrice(Math.round(nominalVal)) : '';
                              } else {
                                const currentPercent = Number(discField.value || 0);
                                displayValue = currentPercent > 0 ? String(Math.round(currentPercent * 1000000) / 1000000) : '';
                              }
                            }

                            return (
                              <div className="flex flex-col items-end gap-1">
                                <div className="relative w-full">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={displayValue}
                                    onChange={(e) => handleDiscountChange(index, e.target.value)}
                                    onBlur={() => {
                                      const rawVal = rawDiscountInputs[index] || '';
                                      if (rawVal) {
                                        if (discType === 'NOMINAL') {
                                          const nominal = parseIndonesianPrice(rawVal);
                                          setRawDiscountInputs(prev => ({ ...prev, [index]: formatIndonesianPrice(nominal) }));
                                        } else {
                                          const percent = Number(rawVal);
                                          setRawDiscountInputs(prev => ({ ...prev, [index]: String(percent) }));
                                        }
                                      } else {
                                        setRawDiscountInputs(prev => {
                                          const next = { ...prev };
                                          delete next[index];
                                          return next;
                                        });
                                      }
                                    }}
                                    className="h-9 pl-2 pr-9 text-right font-mono text-sm"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => toggleDiscountType(index)}
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-1 py-0.5 rounded border border-input hover:bg-muted bg-popover text-foreground transition-colors cursor-pointer select-none"
                                    title="Klik untuk mengubah tipe diskon (% / Rp)"
                                  >
                                    {discType === 'PERCENT' ? '%' : 'Rp'}
                                  </button>
                                </div>
                                {afterDisc < sub && (
                                  <span className="text-[10px] font-mono text-red-500 whitespace-nowrap">
                                    -{formatRupiah(sub - afterDisc)}
                                  </span>
                                )}
                              </div>
                            );
                          }}
                        />
                      </TableCell>
                      
                      {/* Pajak */}
                      <TableCell className="pt-3">
                        <div className="flex items-center justify-center gap-1 mt-1.5">
                          <Checkbox
                            id={`taxable-so-table-${index}`}
                            checked={taxableItems[index] ?? false}
                            onCheckedChange={(checked) => {
                              setTaxableItems((prev) => ({ ...prev, [index]: !!checked }));
                              if (!checked) {
                                form.setValue(`items.${index}.taxPercent`, 0);
                                form.setValue(`items.${index}.dppOtherAmount`, null);
                              } else {
                                // Auto-set PPN 11% when checkbox is checked and tax is 0
                                const currentTax = Number(form.getValues(`items.${index}.taxPercent`) || 0);
                                if (currentTax === 0) {
                                  form.setValue(`items.${index}.taxPercent`, 11);
                                }
                                // Default to INCLUDE if no mode set
                                const currentMode = form.getValues(`items.${index}.ppnMode`);
                                if (!currentMode || currentMode === 'EXCLUDE') {
                                  form.setValue(`items.${index}.ppnMode`, 'INCLUDE');
                                }
                              }
                            }}
                          />
                          <label
                            htmlFor={`taxable-so-table-${index}`}
                            className="text-xs text-muted-foreground cursor-pointer select-none whitespace-nowrap"
                          >
                            PPN
                          </label>
                          
                          {(taxableItems[index] ?? false) && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                                >
                                  <Settings className="h-3.5 w-3.5" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80 p-4 space-y-4" align="end">
                                <h4 className="font-medium text-sm border-b pb-2">Opsi Pajak Lanjutan</h4>
                                
                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Mode PPN</Label>
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.ppnMode`}
                                    render={({ field: ppnField }) => (
                                      <RadioGroup
                                        value={ppnField.value || 'EXCLUDE'}
                                        onValueChange={ppnField.onChange}
                                        className="flex flex-col gap-2 pt-1"
                                      >
                                        <div className="flex items-center gap-2">
                                          <RadioGroupItem value="EXCLUDE" id={`ppn-excl-pop-${index}`} />
                                          <Label htmlFor={`ppn-excl-pop-${index}`} className="text-xs cursor-pointer">
                                            Exclude (harga + pajak)
                                          </Label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <RadioGroupItem value="INCLUDE" id={`ppn-incl-pop-${index}`} />
                                          <Label htmlFor={`ppn-incl-pop-${index}`} className="text-xs cursor-pointer">
                                            Include (harga termasuk)
                                          </Label>
                                        </div>
                                      </RadioGroup>
                                    )}
                                  />
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">Tarif Pajak (%)</Label>
                                  <div className="flex items-center gap-2">
                                    <FormField
                                      control={form.control}
                                      name={`items.${index}.taxPercent`}
                                      render={({ field: taxField }) => (
                                        <Input
                                          type="number"
                                          min="0"
                                          max="100"
                                          step="1"
                                          className="h-8 w-20 text-center font-mono text-sm"
                                          {...taxField}
                                        />
                                      )}
                                    />
                                    <span className="text-xs text-muted-foreground">%</span>
                                    <span className="text-xs font-mono text-muted-foreground ml-auto">
                                      {afterDisc * (tax / 100) > 0 ? formatRupiah(afterDisc * (tax / 100)) : "Rp 0"}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1.5">
                                  <Label className="text-xs text-muted-foreground">DPP (Dasar Pengenaan Pajak)</Label>
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.dppOtherAmount`}
                                    render={({ field: dppField }) => (
                                      <div className="relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                          Rp
                                        </span>
                                        <Input
                                          type="number"
                                          min="0"
                                          step="any"
                                          placeholder="Auto (11/12)"
                                          value={dppField.value ?? ""}
                                          onChange={(e) => {
                                            const normalized = e.target.value.replace(',', '.');
                                            const num = Number(normalized);
                                            dppField.onChange(e.target.value === "" ? null : isNaN(num) ? 0 : num);
                                          }}
                                          className="h-8 pl-7 text-right font-mono text-xs bg-zinc-50 dark:bg-zinc-900"
                                        />
                                      </div>
                                    )}
                                  />
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </TableCell>
                      
                      {/* Subtotal */}
                      <TableCell className="pt-4 text-right font-bold font-mono text-sm text-foreground">
                        {formatRupiah(lineTotal)}
                      </TableCell>
                      
                      {/* Trash action */}
                      <TableCell className="pt-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                          className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {fields.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-sm border-dashed">
                      Belum ada item. Klik &quot;Tambah Item&quot; untuk menambahkan produk.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Desktop Summary Totals */}
          {fields.length > 0 && (
            <div className="hidden md:block w-full max-w-sm ml-auto border rounded-lg p-4 bg-muted/30 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {formLabels.subtotal}
                </span>
                <span className="tabular-nums">
                  {formatRupiah(totals.hasInclude ? totals.dpp : totals.gross)}
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
                <span className="text-muted-foreground">
                  Ongkos Kirim
                </span>
                <Input
                  type="number"
                  min={0}
                  {...form.register("shippingCost", {
                    valueAsNumber: true,
                  })}
                  className="w-32 text-right h-9"
                  placeholder="0"
                />
              </div>
              <div className="flex justify-between items-center pt-2 border-t font-bold text-lg">
                <span>Total Keseluruhan</span>
                <span className="tabular-nums">
                  {formatRupiah(totals.net + watchShippingCost)}
                </span>
              </div>
            </div>
          )}

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
              const ppnMode = (item?.ppnMode || 'EXCLUDE') as PpnMode;
              const ppnResult = calculatePpn(afterDisc, tax, ppnMode);
              const lineTotal = ppnMode === 'INCLUDE' ? ppnResult.dpp : ppnResult.total;
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
                      onClick={() => handleRemoveItem(index)}
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
                              type="text"
                              inputMode="decimal"
                              className="h-11"
                              value={rawQtyInputs[index] !== undefined ? rawQtyInputs[index] : (qtyField.value ?? '')}
                              onChange={(e) => {
                                setRawQtyInputs(prev => ({ ...prev, [index]: e.target.value }));
                                const num = Number(e.target.value.replace(',', '.'));
                                if (!isNaN(num) && e.target.value !== '') {
                                  qtyField.onChange(num);
                                }
                              }}
                              onBlur={() => {
                                const raw = rawQtyInputs[index];
                                const num = Number((raw || '0').replace(',', '.'));
                                qtyField.onChange(isNaN(num) ? 0 : num);
                                setRawQtyInputs(prev => {
                                  const next = { ...prev };
                                  delete next[index];
                                  return next;
                                });
                              }}
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
                          {variant && (
                            <div className="text-[10px] text-muted-foreground text-right">
                              {getPriceSourceLabel(variant)}
                            </div>
                          )}
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
                      render={({ field: discField }) => {
                        const discType = discountTypes[index] || 'PERCENT';
                        const rawVal = rawDiscountInputs[index];
                        
                        let displayValue = '';
                        if (rawVal !== undefined) {
                          displayValue = rawVal;
                        } else {
                          if (discType === 'NOMINAL') {
                            const currentPercent = Number(discField.value || 0);
                            const nominalVal = sub * (currentPercent / 100);
                            displayValue = nominalVal > 0 ? formatIndonesianPrice(Math.round(nominalVal)) : '';
                          } else {
                            const currentPercent = Number(discField.value || 0);
                            displayValue = currentPercent > 0 ? String(Math.round(currentPercent * 1000000) / 1000000) : '';
                          }
                        }

                        return (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground flex justify-between items-center">
                              <span>Diskon</span>
                              <button
                                type="button"
                                onClick={() => toggleDiscountType(index)}
                                className="text-[10px] font-semibold text-primary border rounded px-1 hover:bg-muted transition-colors cursor-pointer"
                              >
                                Tipe: {discType === 'PERCENT' ? '%' : 'Rp'}
                              </button>
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0"
                                  value={displayValue}
                                  onChange={(e) => handleDiscountChange(index, e.target.value)}
                                  onBlur={() => {
                                    const rawVal = rawDiscountInputs[index] || '';
                                    if (rawVal) {
                                      if (discType === 'NOMINAL') {
                                        const nominal = parseIndonesianPrice(rawVal);
                                        setRawDiscountInputs(prev => ({ ...prev, [index]: formatIndonesianPrice(nominal) }));
                                      } else {
                                        const percent = Number(rawVal);
                                        setRawDiscountInputs(prev => ({ ...prev, [index]: String(percent) }));
                                      }
                                    } else {
                                      setRawDiscountInputs(prev => {
                                        const next = { ...prev };
                                        delete next[index];
                                        return next;
                                      });
                                    }
                                  }}
                                  className="h-11 pr-8 text-right font-mono"
                                />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                                  {discType === 'PERCENT' ? '%' : 'Rp'}
                                </span>
                              </div>
                            </FormControl>
                            {afterDisc < sub && (
                              <div className="text-[10px] font-mono text-red-500 text-right mt-1">
                                -{formatRupiah(sub - afterDisc)}
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        );
                      }}
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
        open={quickAddIndex !== null}
        onOpenChange={(open) => {
          if (!open) setQuickAddIndex(null);
        }}
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
                        {formatRupiah(toDisplayUnitPrice(p, getCustomerBasePrice(p)))}/
                        {getProductionUnitMeta(p).displayUnit}
                        {" · "}{getPriceSourceLabel(p)}
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

      {/* New Customer Dialog — triggered from customer picker */}
      <CustomerDialog
        mode="create"
        open={openNewCustomer}
        onOpenChange={setOpenNewCustomer}
        trigger={<span className="hidden" />}
      />
    </Form>
  );
}
