'use client';

import {
    useForm,
    useFieldArray,
    useWatch,
    type Resolver,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    createSalesOrderSchema,
    CreateSalesOrderValues,
    UpdateSalesOrderValues,
    updateSalesOrderSchema,
} from '@/lib/schemas/sales';
import { createSalesOrder, updateSalesOrder } from '@/actions/sales/sales';
import { isBillableDeliveryStatus } from '@/lib/sales/delivery-status';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatRupiah } from '@/lib/utils/utils';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';
import {
    parseIndonesianPrice,
    formatIndonesianPrice,
} from '@/lib/utils/price-format';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import type { CreditExposure } from '@/services/sales/credit-service';
import { getSalesTeamAction } from '@/actions/sales/sales-team';
import { SalesOrderType, ProductType, Unit } from '@prisma/client';
import { useAction } from '@/hooks/use-action';
import { ErrorAlert } from '@/components/ui/error-alert';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    getProductionUnitMeta,
    toBaseQuantity,
} from '@/lib/utils/production-units';
import { salesLabels, actionLabels } from '@/lib/labels';
import { computeOrderTotals } from '@/lib/utils/order-totals';
import type {
    SerializedProductVariant,
    SalesOrderFormProps,
} from './sales-order-types';
import { QuickProductDialog } from './QuickProductDialog';
import { CustomerDialog } from '@/components/customers/CustomerDialog';
import type { SalesOrderFormValues } from './order-form/types';
import { OrderHeaderFields } from './order-form/OrderHeaderFields';
import { DesktopProductCell } from './order-form/DesktopProductCell';
import { DesktopQuantityCell } from './order-form/DesktopQuantityCell';
import { DesktopPriceCell } from './order-form/DesktopPriceCell';
import { DesktopDiscountField } from './order-form/DesktopDiscountField';
import { DesktopTaxCell } from './order-form/DesktopTaxCell';
import { MobileProductHeader } from './order-form/MobileProductHeader';
import { MobileQuantityPriceFields } from './order-form/MobileQuantityPriceFields';
import { MobileDiscountField } from './order-form/MobileDiscountField';
import {
    DesktopOrderTotals,
    MobileOrderTotals,
} from './order-form/OrderTotals';
import { CustomItemDialog } from './order-form/CustomItemDialog';
import { MobileProductSearchDialog } from './order-form/MobileProductSearchDialog';

export function SalesOrderForm({
    customers,
    locations,
    products,
    mode,
    lockedOrderType,
    documentIntent,
    initialData,
    reorderData,
}: SalesOrderFormProps) {
    const router = useRouter();
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
    const [customItemName, setCustomItemName] = useState('');
    const [customItemPrice, setCustomItemPrice] = useState('');
    const [customItems, setCustomItems] = useState<
        { tempId: string; name: string; sellPrice: number }[]
    >([]);
    // Track raw input values for price fields (to allow typing commas/dots)
    const [rawPriceInputs, setRawPriceInputs] = useState<
        Record<number, string>
    >({});
    // Track raw input values for qty fields (to allow empty during editing)
    const [rawQtyInputs, setRawQtyInputs] = useState<Record<number, string>>(
        {},
    );
    const [discountTypes, setDiscountTypes] = useState<
        Record<number, 'PERCENT' | 'NOMINAL'>
    >(() => {
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
    const [rawDiscountInputs, setRawDiscountInputs] = useState<
        Record<number, string>
    >(() => {
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
            ? ((initialData as Record<string, unknown>).customerId as
                  | string
                  | undefined)
            : reorderData?.customerId,
    );

    // Sales team for dropdown
    const [salesTeam, setSalesTeam] = useState<{ id: string; name: string }[]>(
        [],
    );
    useEffect(() => {
        getSalesTeamAction()
            .then((result) => {
                const data =
                    result && typeof result === 'object' && 'data' in result
                        ? (
                              result as {
                                  data: { id: string; name: string }[] | null;
                              }
                          ).data
                        : null;
                setSalesTeam(data ?? []);
            })
            .catch(() => setSalesTeam([]));
    }, []);

    // Track which items have "Kena Pajak" checked (controls Pajak/DPP visibility)
    const [taxableItems, setTaxableItems] = useState<Record<number, boolean>>(
        () => {
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
        },
    );

    // Filter locations for stock-based sales fulfillment
    // Uses locationPurpose for proper categorization (FINISHED_GOOD, PACKING, GENERAL_PURPOSE, RAW_MATERIAL, SCRAP)
    // Previously filtered by slug keywords which broke tenants with simpler warehouse names.
    const stockFulfillmentLocations = locations.filter(
        (l) =>
            l.locationType !== 'CUSTOMER_OWNED' &&
            [
                'FINISHED_GOOD',
                'PACKING',
                'GENERAL_PURPOSE',
                'RAW_MATERIAL',
                'SCRAP',
            ].includes(l.locationPurpose),
    );

    const maklonProductionLocations = locations.filter(
        (l) => l.locationType === 'CUSTOMER_OWNED',
    );

    const form = useForm<SalesOrderFormValues>({
        resolver: zodResolver(
            mode === 'create' ? createSalesOrderSchema : updateSalesOrderSchema,
        ) as unknown as Resolver<SalesOrderFormValues>,
        defaultValues: initialData
            ? {
                  ...initialData,
                  salesRepId:
                      ((initialData as Record<string, unknown>).salesRepId as
                          | string
                          | null) ?? null,
                  orderType:
                      lockedOrderType ||
                      ((initialData as Record<string, unknown>)
                          .orderType as SalesOrderType) ||
                      'MAKE_TO_STOCK',
              }
            : reorderData
              ? {
                    customerId: reorderData.customerId,
                    sourceLocationId: reorderData.sourceLocationId,
                    orderDate: new Date(),
                    orderType:
                        lockedOrderType ||
                        (reorderData.orderType as SalesOrderType) ||
                        'MAKE_TO_STOCK',
                    notes: reorderData.notes || '',
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
                    customerId: '',
                    salesRepId: null,
                    sourceLocationId: '',
                    orderDate: new Date(),
                    notes: '',
                    shippingCost: 0,
                    items: [
                        {
                            productVariantId: '',
                            quantity: 1,
                            unitPrice: 0,
                            discountPercent: 0,
                            taxPercent: 0,
                            dppOtherAmount: null,
                            ppnMode: 'EXCLUDE' as 'INCLUDE' | 'EXCLUDE',
                        },
                    ],
                    orderType: (lockedOrderType ||
                        'MAKE_TO_STOCK') as SalesOrderType,
                },
    });

    // Filter products based on selected source location
    // Unified types and watching
    const selectedSourceLocationId = useWatch({
        control: form.control,
        name: 'sourceLocationId',
    });
    const selectedOrderType = useWatch({
        control: form.control,
        name: 'orderType',
    });
    const selectedCustomerId = useWatch({
        control: form.control,
        name: 'customerId',
    });

    const selectableLocations =
        selectedOrderType === 'MAKLON_JASA'
            ? maklonProductionLocations
            : stockFulfillmentLocations;

    const isLocationRequired = selectedOrderType === 'MAKLON_JASA';

    const productEmptyMessage =
        selectedOrderType === 'MAKLON_JASA'
            ? 'Tidak ada service item untuk Maklon Jasa. Stok fisik di Maklon Packing Area dipakai saat production execution, bukan dipilih sebagai item sales.'
            : 'Tidak ada produk ditemukan.';

    const sourceLocationLabel =
        selectedOrderType === 'MAKLON_JASA'
            ? salesLabels.customerWarehouse
            : `${salesLabels.sourceWarehouse} (Opsional)`;

    const sourceLocationPlaceholder =
        selectedOrderType === 'MAKLON_JASA'
            ? 'Pilih gudang customer'
            : 'Pilih gudang (opsional)';

    const sourceLocationDescription =
        selectedOrderType === 'MAKLON_JASA'
            ? 'Untuk Maklon Jasa, field ini harus memakai warehouse customer-owned. Lokasi ini menjadi default sumber bahan titipan customer untuk flow maklon, lalu Production Execution tetap memprioritaskan stok yang sudah dipindah ke lokasi proses jika ada.'
            : 'Bisa dikosongkan untuk order cepat. Pilih gudang saat ingin reservasi stok atau kirim barang.';

    const filteredProducts = useMemo(() => {
        const allProducts = [...products, ...newProducts];
        let baseProducts = allProducts;

        // Filter by ProductType based on OrderType
        if (selectedOrderType === 'MAKLON_JASA') {
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
            selectedOrderType === 'MAKE_TO_ORDER' ||
            selectedOrderType === 'MAKLON_JASA'
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
        name: 'items',
    });

    const watchItems = useWatch({ control: form.control, name: 'items' });
    const watchShippingCost =
        useWatch({ control: form.control, name: 'shippingCost' }) || 0;
    const watchCustomerId = useWatch({
        control: form.control,
        name: 'customerId',
    });

    // Credit exposure state
    const [creditExposure, setCreditExposure] = useState<CreditExposure | null>(
        null,
    );
    const [loadingExposure, setLoadingExposure] = useState(false);

    // Fetch credit exposure when customer changes
    useEffect(() => {
        if (!watchCustomerId) {
            setCreditExposure(null);
            return;
        }
        let cancelled = false;
        setLoadingExposure(true);
        import('@/actions/sales/customer').then(
            ({ getCustomerCreditExposureAction }) => {
                getCustomerCreditExposureAction(watchCustomerId)
                    .then((result) => {
                        if (!cancelled) {
                            const data =
                                result &&
                                typeof result === 'object' &&
                                'data' in result
                                    ? (
                                          result as {
                                              data: CreditExposure | null;
                                          }
                                      ).data
                                    : null;
                            setCreditExposure(data ?? null);
                            setLoadingExposure(false);
                        }
                    })
                    .catch(() => {
                        if (!cancelled) {
                            setCreditExposure(null);
                            setLoadingExposure(false);
                        }
                    });
            },
        );
        return () => {
            cancelled = true;
        };
    }, [watchCustomerId]);

    // ── Fase C: discount ceiling inline warning (cheap client path) ──
    // customers prop now carries maxDiscountPercent after batch 3 mapping.
    // Tenant-wide ceiling still server-side only (AppSetting) — not shown
    // client-side without extra fetch (follow-up: expose via light action if needed).
    const selectedCustomerCeiling = useMemo(() => {
        if (!watchCustomerId) return null;
        const found = (
            customers as unknown as {
                id: string;
                maxDiscountPercent?: number | null;
            }[]
        ).find((c) => c.id === watchCustomerId);
        const raw = found?.maxDiscountPercent;
        if (raw == null) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }, [customers, watchCustomerId]);

    // Check if shipping cost is driven by fleet delivery orders
    const deliveryOrders = (initialData as Record<string, unknown>)
        ?.deliveryOrders as
        | Array<{ id: string; status: string; totalCharge: number | null }>
        | undefined;
    const isShippingFromFleet =
        mode === 'edit' &&
        Array.isArray(deliveryOrders) &&
        deliveryOrders.some(
            (d) => d.totalCharge != null && isBillableDeliveryStatus(d.status),
        );

    // Adjust discount percents when subtotal changes for NOMINAL discounts
    useEffect(() => {
        if (!watchItems) return;
        const items = form.getValues('items') || [];
        items.forEach((item, index) => {
            const type = discountTypes[index];
            if (type === 'NOMINAL') {
                const rawInput = rawDiscountInputs[index] || '';
                const nominal = rawInput ? parseIndonesianPrice(rawInput) : 0;
                const qty = Number(item.quantity || 0);
                const price = Number(item.unitPrice || 0);
                const subtotal = qty * price;
                const calculatedPercent =
                    subtotal > 0 ? (nominal / subtotal) * 100 : 0;

                const currentPercent = Number(item.discountPercent || 0);
                if (Math.abs(currentPercent - calculatedPercent) > 0.000001) {
                    form.setValue(
                        `items.${index}.discountPercent`,
                        calculatedPercent,
                        { shouldDirty: false },
                    );
                }
            }
        });
    }, [watchItems, discountTypes, rawDiscountInputs, form]);

    // Auto-calculate DPPnya = DPP × 11/12 when qty, price, or discount changes
    useEffect(() => {
        const items = form.getValues('items') || [];
        items.forEach((item, index) => {
            const qty = Number(item.quantity || 0);
            const price = Number(item.unitPrice || 0);
            const discount = Number(item.discountPercent || 0);
            const dpp = qty * price * (1 - discount / 100);
            const autoDppOther =
                dpp > 0 ? Math.round(((dpp * 11) / 12) * 100) / 100 : null;
            const current = item.dppOtherAmount;
            if (current !== autoDppOther) {
                form.setValue(`items.${index}.dppOtherAmount`, autoDppOther, {
                    shouldDirty: false,
                });
            }
        });
    }, [watchItems, form]);

    const handleRemoveItem = (index: number) => {
        remove(index);
        setTaxableItems((prev) => {
            const newMap: Record<number, boolean> = {};
            Object.keys(prev)
                .map(Number)
                .sort((a, b) => a - b)
                .filter((i) => i !== index)
                .forEach((oldIdx, newIdx) => {
                    newMap[newIdx] = prev[oldIdx];
                });
            return newMap;
        });
        setDiscountTypes((prev) => {
            const newMap: Record<number, 'PERCENT' | 'NOMINAL'> = {};
            Object.keys(prev)
                .map(Number)
                .sort((a, b) => a - b)
                .filter((i) => i !== index)
                .forEach((oldIdx, newIdx) => {
                    newMap[newIdx] = prev[oldIdx];
                });
            return newMap;
        });
        setRawDiscountInputs((prev) => {
            const newMap: Record<number, string> = {};
            Object.keys(prev)
                .map(Number)
                .sort((a, b) => a - b)
                .filter((i) => i !== index)
                .forEach((oldIdx, newIdx) => {
                    newMap[newIdx] = prev[oldIdx];
                });
            return newMap;
        });
    };

    const toggleDiscountType = (index: number) => {
        const currentType = discountTypes[index] || 'PERCENT';
        const nextType = currentType === 'PERCENT' ? 'NOMINAL' : 'PERCENT';

        const currentPercent = Number(
            form.getValues(`items.${index}.discountPercent`) || 0,
        );
        const qty = Number(form.getValues(`items.${index}.quantity`) || 0);
        const price = Number(form.getValues(`items.${index}.unitPrice`) || 0);
        const subtotal = qty * price;

        let nextValueString = '';

        if (nextType === 'NOMINAL') {
            const nominal = subtotal * (currentPercent / 100);
            nextValueString = nominal > 0 ? String(Math.round(nominal)) : '';
        } else {
            const rawInput = rawDiscountInputs[index] || '';
            const nominal = rawInput
                ? parseIndonesianPrice(rawInput)
                : subtotal * (currentPercent / 100);
            const percent = subtotal > 0 ? (nominal / subtotal) * 100 : 0;
            nextValueString =
                percent > 0
                    ? String(Math.round(percent * 1000000) / 1000000)
                    : '';
        }

        setDiscountTypes((prev) => ({ ...prev, [index]: nextType }));

        if (nextValueString) {
            setRawDiscountInputs((prev) => ({
                ...prev,
                [index]:
                    nextType === 'NOMINAL'
                        ? formatIndonesianPrice(Number(nextValueString))
                        : nextValueString,
            }));
            const val = Number(nextValueString);
            if (nextType === 'NOMINAL') {
                const calculatedPercent =
                    subtotal > 0 ? (val / subtotal) * 100 : 0;
                form.setValue(
                    `items.${index}.discountPercent`,
                    calculatedPercent,
                    { shouldDirty: true },
                );
            } else {
                form.setValue(`items.${index}.discountPercent`, val, {
                    shouldDirty: true,
                });
            }
        } else {
            setRawDiscountInputs((prev) => {
                const next = { ...prev };
                delete next[index];
                return next;
            });
            form.setValue(`items.${index}.discountPercent`, 0, {
                shouldDirty: true,
            });
        }
    };

    const handleDiscountChange = (index: number, valStr: string) => {
        setRawDiscountInputs((prev) => ({ ...prev, [index]: valStr }));

        const type = discountTypes[index] || 'PERCENT';
        const qty = Number(form.getValues(`items.${index}.quantity`) || 0);
        const price = Number(form.getValues(`items.${index}.unitPrice`) || 0);
        const subtotal = qty * price;

        if (!valStr) {
            form.setValue(`items.${index}.discountPercent`, 0, {
                shouldDirty: true,
            });
            return;
        }

        if (type === 'NOMINAL') {
            const nominal = parseIndonesianPrice(valStr);
            const calculatedPercent =
                subtotal > 0 ? (nominal / subtotal) * 100 : 0;
            form.setValue(`items.${index}.discountPercent`, calculatedPercent, {
                shouldDirty: true,
            });
        } else {
            const percent = Number(valStr);
            form.setValue(`items.${index}.discountPercent`, percent, {
                shouldDirty: true,
            });
        }
    };

    const getLineVariant = (index: number) => {
        const productVariantId = form.getValues(
            `items.${index}.productVariantId`,
        );
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

    const getCustomerBasePrice = useCallback(
        (variant: SerializedProductVariant) => {
            const customerPrice = selectedCustomerId
                ? variant.customerPrices?.find(
                      (price) =>
                          price.customerId === selectedCustomerId &&
                          price.isActive,
                  )
                : undefined;
            return (
                customerPrice?.unitPrice ??
                variant.sellPrice ??
                variant.price ??
                0
            );
        },
        [selectedCustomerId],
    );

    const getPriceSourceLabel = useCallback(
        (variant: SerializedProductVariant) => {
            if (!selectedCustomerId) return 'Harga default';
            return variant.customerPrices?.some(
                (price) =>
                    price.customerId === selectedCustomerId && price.isActive,
            )
                ? 'Harga khusus customer'
                : 'Harga default';
        },
        [selectedCustomerId],
    );

    const selectProduct = (
        index: number,
        variant: SerializedProductVariant,
    ) => {
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

        const items = form.getValues('items');
        const hasProducts = items.some((item) => item.productVariantId);
        if (!hasProducts) return;

        const shouldUpdate = window.confirm(
            'Customer berubah. Update harga item sesuai harga customer baru?',
        );
        if (!shouldUpdate) return;

        items.forEach((item, index) => {
            const variant = products.find(
                (p) => p.id === item.productVariantId,
            );
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

    const CUSTOM_ITEM_PREFIX = 'custom:';

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
        setCustomItemName('');
        setCustomItemPrice('');
    };

    const totals = computeOrderTotals(watchItems || []);

    // Derived credit state
    const proposedTotal = totals.net + watchShippingCost;
    const hasExposure = creditExposure !== null;
    const isOverLimit = hasExposure && proposedTotal > creditExposure!.headroom;
    const isNearLimit =
        hasExposure &&
        !isOverLimit &&
        creditExposure!.headroom > 0 &&
        proposedTotal > creditExposure!.headroom * 0.9;
    const headroomAfterProposal = hasExposure
        ? creditExposure!.headroom - proposedTotal
        : null;

    const {
        execute: submitAction,
        isPending: isSubmitting,
        error: actionError,
    } = useAction(
        async (data: SalesOrderFormValues) => {
            const values =
                mode === 'create'
                    ? { ...data, intent: documentIntent || 'order' }
                    : { ...data, id: initialData!.id };

            return mode === 'create'
                ? await createSalesOrder(values as CreateSalesOrderValues)
                : await updateSalesOrder(values as UpdateSalesOrderValues);
        },
        {
            form,
            successMessage: `Sales Order ${mode === 'create' ? 'berhasil dibuat' : 'berhasil diperbarui'}.`,
            onSuccess: () => router.push('/sales/orders'),
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

                const variant = products.find(
                    (p) => p.id === item.productVariantId,
                );
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
        if (mode === 'edit') {
            const confirmed = window.confirm(
                'Apakah Anda yakin ingin menyimpan perubahan pada Sales Order ini? Perubahan harga/qty akan mempengaruhi total dan jurnal yang sudah terbentuk.',
            );
            if (!confirmed) return;
        }
        await submitAction(normalizeFormDataForSubmit(data));
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <ErrorAlert error={actionError} />

                {mode === 'edit' && (
                    <Alert className="border-amber-200 bg-amber-50 text-amber-900">
                        <AlertTitle>⚠️ Mode Edit Sales Order</AlertTitle>
                        <AlertDescription>
                            <ul className="list-disc list-inside space-y-1 mt-1">
                                <li>
                                    Harga satuan tidak bisa diubah jika sudah
                                    ada invoice
                                </li>
                                <li>
                                    Qty tidak bisa dikurangi di bawah jumlah
                                    yang sudah dikirim
                                </li>
                                <li>
                                    Perubahan akan memperbarui total dan jurnal
                                </li>
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                    Untuk pesanan pelanggan. Produksi stok internal dibuat
                    melalui Production Order di menu Planning.
                </p>

                <h2 className="text-base font-semibold">Informasi Pesanan</h2>

                {/* Header Information */}
                <OrderHeaderFields
                    form={form}
                    customers={customers}
                    setOpenNewCustomer={setOpenNewCustomer}
                    isOverLimit={isOverLimit}
                    watchCustomerId={watchCustomerId}
                    loadingExposure={loadingExposure}
                    creditExposure={creditExposure}
                    isNearLimit={isNearLimit}
                    headroomAfterProposal={headroomAfterProposal}
                    sourceLocationLabel={sourceLocationLabel}
                    sourceLocationPlaceholder={sourceLocationPlaceholder}
                    sourceLocationDescription={sourceLocationDescription}
                    isLocationRequired={isLocationRequired}
                    selectableLocations={selectableLocations}
                    lockedOrderType={lockedOrderType}
                    mode={mode}
                    selectedOrderType={selectedOrderType}
                    documentIntent={documentIntent}
                    salesTeam={salesTeam}
                />

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
                            onClick={() => {
                                const newIndex = fields.length;
                                setTaxableItems((prev) => ({
                                    ...prev,
                                    [newIndex]: false,
                                }));
                                setDiscountTypes((prev) => ({
                                    ...prev,
                                    [newIndex]: 'PERCENT',
                                }));
                                append({
                                    productVariantId: '',
                                    quantity: 1,
                                    unitPrice: 0,
                                    discountPercent: 0,
                                    taxPercent: 0,
                                    dppOtherAmount: null,
                                    ppnMode: 'EXCLUDE' as 'INCLUDE' | 'EXCLUDE',
                                });
                            }}
                        >
                            <Plus className="mr-2 h-4 w-4" /> {actionLabels.add}{' '}
                            Item
                        </Button>
                    </div>

                    {selectedOrderType === 'MAKLON_JASA' && (
                        <p className="text-sm text-muted-foreground">
                            Maklon Jasa hanya menampilkan service item. Barang
                            fisik di Maklon Packing Area tetap dikonsumsi saat
                            production execution.
                        </p>
                    )}

                    {/* Desktop Table View */}
                    <div className="hidden rounded-lg border bg-card md:block">
                        <Table className="min-w-[900px] [&_tbody_td]:align-top">
                            <TableHeader className="bg-muted/40">
                                <TableRow>
                                    <TableHead className="w-[50px] text-center">
                                        #
                                    </TableHead>
                                    <TableHead className="min-w-[250px]">
                                        Produk
                                    </TableHead>
                                    <TableHead className="w-[150px] px-2 text-center">
                                        Qty
                                    </TableHead>
                                    <TableHead className="w-[180px] text-right">
                                        Harga Satuan
                                    </TableHead>
                                    <TableHead className="w-[120px] px-2 text-right">
                                        Diskon
                                    </TableHead>
                                    <TableHead className="w-[110px] text-center">
                                        Pajak
                                    </TableHead>
                                    <TableHead className="w-[160px] text-right">
                                        Subtotal
                                    </TableHead>
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
                                    const ppnMode = (item?.ppnMode ||
                                        'EXCLUDE') as PpnMode;
                                    const ppnResult = calculatePpn(
                                        afterDisc,
                                        tax,
                                        ppnMode,
                                    );
                                    const lineTotal =
                                        ppnMode === 'INCLUDE'
                                            ? ppnResult.dpp
                                            : ppnResult.total;
                                    const unitMeta = getLineUnitMeta(index);
                                    const variant = getLineVariant(index);

                                    return (
                                        <TableRow
                                            key={field.id}
                                            className="align-top"
                                        >
                                            <TableCell className="text-center pt-5 font-mono text-sm text-muted-foreground">
                                                {index + 1}
                                            </TableCell>

                                            {/* Produk */}
                                            <DesktopProductCell
                                                form={form}
                                                index={index}
                                                openProduct={openProduct}
                                                setOpenProduct={setOpenProduct}
                                                CUSTOM_ITEM_PREFIX={
                                                    CUSTOM_ITEM_PREFIX
                                                }
                                                customItems={customItems}
                                                filteredProducts={
                                                    filteredProducts
                                                }
                                                productEmptyMessage={
                                                    productEmptyMessage
                                                }
                                                selectProduct={selectProduct}
                                                toDisplayUnitPrice={
                                                    toDisplayUnitPrice
                                                }
                                                getCustomerBasePrice={
                                                    getCustomerBasePrice
                                                }
                                                getPriceSourceLabel={
                                                    getPriceSourceLabel
                                                }
                                                setCustomItemIndex={
                                                    setCustomItemIndex
                                                }
                                                setQuickAddIndex={
                                                    setQuickAddIndex
                                                }
                                                variant={variant}
                                            />

                                            {/* Qty */}
                                            <DesktopQuantityCell
                                                form={form}
                                                index={index}
                                                rawQtyInputs={rawQtyInputs}
                                                setRawQtyInputs={
                                                    setRawQtyInputs
                                                }
                                                unitMeta={unitMeta}
                                            />

                                            {/* Harga Satuan */}
                                            <DesktopPriceCell
                                                form={form}
                                                index={index}
                                                rawPriceInputs={rawPriceInputs}
                                                setRawPriceInputs={
                                                    setRawPriceInputs
                                                }
                                                variant={variant}
                                                getPriceSourceLabel={
                                                    getPriceSourceLabel
                                                }
                                            />

                                            {/* Diskon */}
                                            <TableCell className="px-2 pt-3">
                                                <FormField
                                                    control={form.control}
                                                    name={`items.${index}.discountPercent`}
                                                    render={({
                                                        field: discField,
                                                    }) => {
                                                        const discType =
                                                            discountTypes[
                                                                index
                                                            ] || 'PERCENT';
                                                        const rawVal =
                                                            rawDiscountInputs[
                                                                index
                                                            ];

                                                        let displayValue = '';
                                                        if (
                                                            rawVal !== undefined
                                                        ) {
                                                            displayValue =
                                                                rawVal;
                                                        } else {
                                                            if (
                                                                discType ===
                                                                'NOMINAL'
                                                            ) {
                                                                const currentPercent =
                                                                    Number(
                                                                        discField.value ||
                                                                            0,
                                                                    );
                                                                const nominalVal =
                                                                    sub *
                                                                    (currentPercent /
                                                                        100);
                                                                displayValue =
                                                                    nominalVal >
                                                                    0
                                                                        ? formatIndonesianPrice(
                                                                              Math.round(
                                                                                  nominalVal,
                                                                              ),
                                                                          )
                                                                        : '';
                                                            } else {
                                                                const currentPercent =
                                                                    Number(
                                                                        discField.value ||
                                                                            0,
                                                                    );
                                                                displayValue =
                                                                    currentPercent >
                                                                    0
                                                                        ? String(
                                                                              Math.round(
                                                                                  currentPercent *
                                                                                      1000000,
                                                                              ) /
                                                                                  1000000,
                                                                          )
                                                                        : '';
                                                            }
                                                        }

                                                        return (
                                                            <DesktopDiscountField
                                                                index={index}
                                                                displayValue={
                                                                    displayValue
                                                                }
                                                                handleDiscountChange={
                                                                    handleDiscountChange
                                                                }
                                                                rawDiscountInputs={
                                                                    rawDiscountInputs
                                                                }
                                                                discType={
                                                                    discType
                                                                }
                                                                setRawDiscountInputs={
                                                                    setRawDiscountInputs
                                                                }
                                                                toggleDiscountType={
                                                                    toggleDiscountType
                                                                }
                                                                afterDisc={
                                                                    afterDisc
                                                                }
                                                                sub={sub}
                                                                selectedCustomerCeiling={
                                                                    selectedCustomerCeiling
                                                                }
                                                                discField={
                                                                    discField
                                                                }
                                                            />
                                                        );
                                                    }}
                                                />
                                            </TableCell>

                                            {/* Pajak */}
                                            <DesktopTaxCell
                                                form={form}
                                                index={index}
                                                taxableItems={taxableItems}
                                                setTaxableItems={
                                                    setTaxableItems
                                                }
                                                afterDisc={afterDisc}
                                                tax={tax}
                                            />

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
                                                    onClick={() =>
                                                        handleRemoveItem(index)
                                                    }
                                                    className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                                    aria-label={`Hapus item ${index + 1}`}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {fields.length === 0 && (
                                    <TableRow>
                                        <TableCell
                                            colSpan={8}
                                            className="text-center py-8 text-muted-foreground text-sm border-dashed"
                                        >
                                            Belum ada item. Klik &quot;Tambah
                                            Item&quot; untuk menambahkan produk.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
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
                            const ppnMode = (item?.ppnMode ||
                                'EXCLUDE') as PpnMode;
                            const ppnResult = calculatePpn(
                                afterDisc,
                                tax,
                                ppnMode,
                            );
                            const lineTotal =
                                ppnMode === 'INCLUDE'
                                    ? ppnResult.dpp
                                    : ppnResult.total;
                            const variant = getLineVariant(index);
                            const unitMeta = getLineUnitMeta(index);

                            return (
                                <div
                                    key={field.id}
                                    className="border rounded-lg p-4 space-y-3 bg-card"
                                >
                                    {/* Product header */}
                                    <MobileProductHeader
                                        form={form}
                                        index={index}
                                        setMobileProductSearch={
                                            setMobileProductSearch
                                        }
                                        CUSTOM_ITEM_PREFIX={CUSTOM_ITEM_PREFIX}
                                        customItems={customItems}
                                        filteredProducts={filteredProducts}
                                        variant={variant}
                                        unitMeta={unitMeta}
                                        handleRemoveItem={handleRemoveItem}
                                    />

                                    {/* Qty & Price */}
                                    <MobileQuantityPriceFields
                                        form={form}
                                        index={index}
                                        unitMeta={unitMeta}
                                        rawQtyInputs={rawQtyInputs}
                                        setRawQtyInputs={setRawQtyInputs}
                                        variant={variant}
                                        getPriceSourceLabel={
                                            getPriceSourceLabel
                                        }
                                    />

                                    {/* Discount & Tax */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <FormField
                                            control={form.control}
                                            name={`items.${index}.discountPercent`}
                                            render={({ field: discField }) => {
                                                const discType =
                                                    discountTypes[index] ||
                                                    'PERCENT';
                                                const rawVal =
                                                    rawDiscountInputs[index];

                                                let displayValue = '';
                                                if (rawVal !== undefined) {
                                                    displayValue = rawVal;
                                                } else {
                                                    if (
                                                        discType === 'NOMINAL'
                                                    ) {
                                                        const currentPercent =
                                                            Number(
                                                                discField.value ||
                                                                    0,
                                                            );
                                                        const nominalVal =
                                                            sub *
                                                            (currentPercent /
                                                                100);
                                                        displayValue =
                                                            nominalVal > 0
                                                                ? formatIndonesianPrice(
                                                                      Math.round(
                                                                          nominalVal,
                                                                      ),
                                                                  )
                                                                : '';
                                                    } else {
                                                        const currentPercent =
                                                            Number(
                                                                discField.value ||
                                                                    0,
                                                            );
                                                        displayValue =
                                                            currentPercent > 0
                                                                ? String(
                                                                      Math.round(
                                                                          currentPercent *
                                                                              1000000,
                                                                      ) /
                                                                          1000000,
                                                                  )
                                                                : '';
                                                    }
                                                }

                                                return (
                                                    <MobileDiscountField
                                                        index={index}
                                                        displayValue={
                                                            displayValue
                                                        }
                                                        handleDiscountChange={
                                                            handleDiscountChange
                                                        }
                                                        rawDiscountInputs={
                                                            rawDiscountInputs
                                                        }
                                                        discType={discType}
                                                        setRawDiscountInputs={
                                                            setRawDiscountInputs
                                                        }
                                                        toggleDiscountType={
                                                            toggleDiscountType
                                                        }
                                                        afterDisc={afterDisc}
                                                        sub={sub}
                                                        selectedCustomerCeiling={
                                                            selectedCustomerCeiling
                                                        }
                                                        discField={discField}
                                                    />
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
                                Belum ada item. Klik &quot;Tambah Item&quot;
                                untuk menambahkan produk.
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid items-start gap-6 md:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Catatan</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Catatan pesanan (opsional)"
                                        className="min-h-28 resize-y"
                                        {...field}
                                        value={field.value || ''}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    {fields.length > 0 && (
                        <div className="min-w-0">
                            <DesktopOrderTotals
                                form={form}
                                totals={totals}
                                isShippingFromFleet={isShippingFromFleet}
                                watchShippingCost={watchShippingCost}
                            />
                            <div className="md:hidden">
                                <MobileOrderTotals
                                    form={form}
                                    totals={totals}
                                    isShippingFromFleet={isShippingFromFleet}
                                    watchShippingCost={watchShippingCost}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 border-t pt-5">
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => router.back()}
                    >
                        {actionLabels.cancel}
                    </Button>
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {mode === 'create'
                            ? `${actionLabels.create} Order`
                            : `${actionLabels.update} Order`}
                    </Button>
                </div>
            </form>

            {/* Inline Custom Item Form */}
            {customItemIndex !== null && (
                <CustomItemDialog
                    customItemIndex={customItemIndex}
                    setCustomItemIndex={setCustomItemIndex}
                    customItemName={customItemName}
                    setCustomItemName={setCustomItemName}
                    customItemPrice={customItemPrice}
                    setCustomItemPrice={setCustomItemPrice}
                    confirmCustomItem={confirmCustomItem}
                />
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
            <MobileProductSearchDialog
                form={form}
                mobileProductSearch={mobileProductSearch}
                setMobileProductSearch={setMobileProductSearch}
                productEmptyMessage={productEmptyMessage}
                filteredProducts={filteredProducts}
                selectProduct={selectProduct}
                toDisplayUnitPrice={toDisplayUnitPrice}
                getCustomerBasePrice={getCustomerBasePrice}
                getPriceSourceLabel={getPriceSourceLabel}
                setCustomItemIndex={setCustomItemIndex}
                setQuickAddIndex={setQuickAddIndex}
            />

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
