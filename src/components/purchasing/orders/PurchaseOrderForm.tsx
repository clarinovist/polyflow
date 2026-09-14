'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    useForm,
    useFieldArray,
    SubmitHandler,
    useWatch,
    type Resolver,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
    createPurchaseOrderSchema,
    updatePurchaseOrderSchema,
    CreatePurchaseOrderValues,
    UpdatePurchaseOrderValues,
} from '@/lib/schemas/purchasing';
import {
    createPurchaseOrder,
    updatePurchaseOrder,
} from '@/actions/purchasing/purchasing';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Plus, ShoppingBag } from 'lucide-react';
import { calculatePpn, type PpnMode } from '@/lib/utils/ppn';
import { Badge } from '@/components/ui/badge';
import { formLabels, actionLabels } from '@/lib/labels';
import { PurchaseOrderDesktopItem } from './order-form/PurchaseOrderDesktopItem';
import { PurchaseOrderMobileItem } from './order-form/PurchaseOrderMobileItem';
import { PurchaseOrderSummary } from './order-form/PurchaseOrderSummary';

interface PurchaseOrderFormProps {
    suppliers: {
        id: string;
        name: string;
        code: string | null;
        paymentTermDays: number | null;
    }[];
    productVariants: {
        id: string;
        name: string;
        skuCode: string;
        buyPrice: number | null;
    }[];
    mode?: 'create' | 'edit';
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
            ppnMode?: 'INCLUDE' | 'EXCLUDE';
        }[];
    };
}

export function PurchaseOrderForm({
    suppliers,
    productVariants,
    mode = 'create',
    initialData,
}: PurchaseOrderFormProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    // Track raw input values for price fields (to allow typing commas/dots)
    const [rawPriceInputs, setRawPriceInputs] = useState<
        Record<number, string>
    >({});
    // Track raw input values for qty fields (to allow empty during editing)
    const [rawQtyInputs, setRawQtyInputs] = useState<Record<number, string>>(
        {},
    );
    // Track which items have "Kena Pajak" checked (controls DPP visibility)
    const [taxableItems, setTaxableItems] = useState<Record<number, boolean>>(
        () => {
            if (initialData) {
                const map: Record<number, boolean> = {};
                initialData.items.forEach((item, i) => {
                    map[i] = (item.taxPercent ?? 0) > 0;
                });
                return map;
            }
            return { 0: false };
        },
    );

    // Edit mode validates against updatePurchaseOrderSchema which requires `id`.
    // Without it in defaultValues, handleSubmit silently fails (button appears clickable but nothing happens).
    const form = useForm<CreatePurchaseOrderValues & { id?: string }>({
        resolver: zodResolver(
            mode === 'create'
                ? createPurchaseOrderSchema
                : updatePurchaseOrderSchema,
        ) as Resolver<CreatePurchaseOrderValues & { id?: string }>,
        defaultValues: initialData
            ? {
                  id: initialData.id,
                  supplierId: initialData.supplierId,
                  orderDate: new Date(initialData.orderDate),
                  expectedDate: initialData.expectedDate
                      ? new Date(initialData.expectedDate)
                      : null,
                  deliveryAddress: initialData.deliveryAddress ?? '',
                  notes: initialData.notes ?? '',
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
                      dppOtherAmount: item.dppOtherAmount
                          ? Number(item.dppOtherAmount)
                          : null,
                      ppnMode:
                          (item.ppnMode as 'INCLUDE' | 'EXCLUDE') || 'EXCLUDE',
                  })),
              }
            : {
                  supplierId: '',
                  orderDate: new Date(),
                  expectedDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                  deliveryAddress: '',
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
                          ppnMode: 'EXCLUDE',
                      },
                  ],
              },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'items',
    });

    const watchedItems = useWatch({
        control: form.control,
        name: 'items',
    });

    const watchedShippingCost =
        useWatch({ control: form.control, name: 'shippingCost' }) || 0;

    const watchedSupplierId = useWatch({
        control: form.control,
        name: 'supplierId',
    });
    const selectedSupplier = suppliers.find((s) => s.id === watchedSupplierId);

    // Auto-calculate DPPnya = DPP × 11/12 when qty, price, or discount changes
    useEffect(() => {
        const items = form.getValues('items');
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

                // Use calculatePpn based on ppnMode
                const ppnMode = (item.ppnMode || 'EXCLUDE') as PpnMode;
                const ppnResult = calculatePpn(
                    taxable,
                    Number(item.taxPercent || 0),
                    ppnMode,
                );

                acc.gross += rawSubtotal;
                acc.discount += discount;
                acc.tax += ppnResult.taxAmount;
                acc.dpp += ppnResult.dpp;
                if (ppnMode === 'INCLUDE' && ppnResult.taxAmount > 0)
                    acc.hasInclude = true;
                // net = what customer actually pays (gross for INCLUDE, gross+tax for EXCLUDE)
                acc.net += ppnResult.total;
                return acc;
            },
            {
                gross: 0,
                discount: 0,
                tax: 0,
                dpp: 0,
                net: 0,
                hasInclude: false,
            },
        );
    }, [watchedItems]);

    const onInvalid = (errors: Record<string, unknown>) => {
        // Walk nested RHF/zod error tree and surface the first message.
        // Without this, edit-mode schema failures (e.g. missing id) fail silently.
        const findFirstMessage = (node: unknown): string | undefined => {
            if (!node || typeof node !== 'object') return undefined;
            const n = node as { message?: unknown; [key: string]: unknown };
            if (typeof n.message === 'string' && n.message) return n.message;
            for (const value of Object.values(n)) {
                const found = findFirstMessage(value);
                if (found) return found;
            }
            return undefined;
        };

        toast.error(
            findFirstMessage(errors) ||
                'Form belum valid. Periksa data item, supplier, dan field wajib lainnya.',
        );
    };

    const onSubmit: SubmitHandler<
        CreatePurchaseOrderValues & { id?: string }
    > = async (data) => {
        if (mode === 'edit') {
            const confirmed = window.confirm(
                'Apakah Anda yakin ingin menyimpan perubahan pada PO ini? Perubahan harga/qty akan mempengaruhi total dan jurnal yang sudah terbentuk.',
            );
            if (!confirmed) return;
        }

        setIsLoading(true);
        try {
            if (mode === 'edit' && initialData?.id) {
                const result = await updatePurchaseOrder({
                    ...data,
                    id: data.id ?? initialData.id,
                } as UpdatePurchaseOrderValues);
                if (result.success) {
                    toast.success('Purchase Order berhasil diupdate');
                    router.push(`/purchasing/orders/${initialData.id}`);
                    router.refresh();
                } else {
                    toast.error(
                        result.error ||
                            'Gagal update Purchase Order. Silakan coba lagi.',
                    );
                }
            } else {
                const result = await createPurchaseOrder(data);
                if (result.success) {
                    toast.success('Purchase Order berhasil dibuat');
                    if (result.data?.id) {
                        router.push(`/purchasing/orders/${result.data.id}`);
                    }
                } else {
                    toast.error(
                        result.error ||
                            'Gagal membuat Purchase Order. Silakan coba lagi.',
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
            form.setValue(
                `items.${index}.unitPrice`,
                Number(variant.buyPrice || 0),
            );
        }
    };

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit, onInvalid)}
                className="space-y-6"
            >
                {mode === 'edit' && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-semibold">⚠️ Mode Edit PO</p>
                        <ul className="mt-1 list-disc list-inside space-y-1 text-amber-700 dark:text-amber-300">
                            <li>
                                Harga satuan tidak bisa diubah jika sudah ada
                                invoice
                            </li>
                            <li>
                                Qty tidak bisa dikurangi di bawah jumlah yang
                                sudah diterima
                            </li>
                            <li>Perubahan akan memperbarui total PO</li>
                        </ul>
                    </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column (Items) - spans 8 columns */}
                    <div className="lg:col-span-8 space-y-6">
                        <Card className="border-zinc-200 dark:border-zinc-700/50 shadow-sm overflow-hidden">
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
                                    <Badge
                                        variant="outline"
                                        className="bg-white dark:bg-zinc-800 dark:text-zinc-200"
                                    >
                                        {fields.length} Item
                                    </Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3">
                                {/* Desktop Table View */}
                                <div className="hidden md:block rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 overflow-x-auto">
                                    <Table className="min-w-[900px]">
                                        <TableHeader className="bg-zinc-50 dark:bg-zinc-900">
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
                                                const item =
                                                    watchedItems[index];
                                                const qty = Number(
                                                    item?.quantity || 0,
                                                );
                                                const price = Number(
                                                    item?.unitPrice || 0,
                                                );
                                                const disc = Number(
                                                    item?.discountPercent || 0,
                                                );
                                                const tax = Number(
                                                    item?.taxPercent || 0,
                                                );
                                                const ppnMode =
                                                    (item?.ppnMode ||
                                                        'EXCLUDE') as PpnMode;
                                                const raw = qty * price;
                                                const discountAmount =
                                                    raw * (disc / 100);
                                                const taxable =
                                                    raw - discountAmount;
                                                const ppnResult = calculatePpn(
                                                    taxable,
                                                    tax,
                                                    ppnMode,
                                                );
                                                // INCLUDE: subtotal shows DPP (base price without tax)
                                                // EXCLUDE: subtotal shows gross (price before tax is added)
                                                const lineTotal =
                                                    ppnMode === 'INCLUDE'
                                                        ? ppnResult.dpp
                                                        : ppnResult.total;
                                                const selectedVariant =
                                                    productVariants.find(
                                                        (v) =>
                                                            v.id ===
                                                            item?.productVariantId,
                                                    );

                                                return (
                                                    <PurchaseOrderDesktopItem
                                                        key={field.id}
                                                        form={form}
                                                        field={field}
                                                        fields={fields}
                                                        index={index}
                                                        productVariants={
                                                            productVariants
                                                        }
                                                        router={router}
                                                        handleProductChange={
                                                            handleProductChange
                                                        }
                                                        rawQtyInputs={
                                                            rawQtyInputs
                                                        }
                                                        setRawQtyInputs={
                                                            setRawQtyInputs
                                                        }
                                                        rawPriceInputs={
                                                            rawPriceInputs
                                                        }
                                                        setRawPriceInputs={
                                                            setRawPriceInputs
                                                        }
                                                        taxableItems={
                                                            taxableItems
                                                        }
                                                        setTaxableItems={
                                                            setTaxableItems
                                                        }
                                                        remove={remove}
                                                        discountAmount={
                                                            discountAmount
                                                        }
                                                        ppnResult={ppnResult}
                                                        lineTotal={lineTotal}
                                                        selectedVariant={
                                                            selectedVariant
                                                        }
                                                    />
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                {/* Mobile Card View */}
                                <div className="md:hidden space-y-3">
                                    {fields.map((field, index) => {
                                        const item = watchedItems[index];
                                        const qty = Number(item?.quantity || 0);
                                        const price = Number(
                                            item?.unitPrice || 0,
                                        );
                                        const disc = Number(
                                            item?.discountPercent || 0,
                                        );
                                        const tax = Number(
                                            item?.taxPercent || 0,
                                        );
                                        const ppnMode = (item?.ppnMode ||
                                            'EXCLUDE') as PpnMode;
                                        const raw = qty * price;
                                        const discountAmount =
                                            raw * (disc / 100);
                                        const taxable = raw - discountAmount;
                                        const ppnResult = calculatePpn(
                                            taxable,
                                            tax,
                                            ppnMode,
                                        );
                                        const lineTotal = ppnResult.total;

                                        return (
                                            <PurchaseOrderMobileItem
                                                key={field.id}
                                                form={form}
                                                field={field}
                                                fields={fields}
                                                index={index}
                                                productVariants={
                                                    productVariants
                                                }
                                                router={router}
                                                handleProductChange={
                                                    handleProductChange
                                                }
                                                rawQtyInputs={rawQtyInputs}
                                                setRawQtyInputs={
                                                    setRawQtyInputs
                                                }
                                                rawPriceInputs={rawPriceInputs}
                                                setRawPriceInputs={
                                                    setRawPriceInputs
                                                }
                                                taxableItems={taxableItems}
                                                setTaxableItems={
                                                    setTaxableItems
                                                }
                                                remove={remove}
                                                discountAmount={discountAmount}
                                                ppnResult={ppnResult}
                                                lineTotal={lineTotal}
                                            />
                                        );
                                    })}
                                </div>

                                <div className="p-4 border-t bg-muted/10">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => {
                                            const newIndex = fields.length;
                                            setTaxableItems((prev) => ({
                                                ...prev,
                                                [newIndex]: false,
                                            }));
                                            append({
                                                productVariantId: '',
                                                quantity: 1,
                                                unitPrice: 0,
                                                discountPercent: 0,
                                                taxPercent: 0,
                                                dppOtherAmount: null,
                                                ppnMode: 'EXCLUDE',
                                            });
                                        }}
                                        className="w-full border-dashed text-muted-foreground hover:text-foreground hover:border-solid hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    >
                                        <Plus className="h-4 w-4 mr-2" />{' '}
                                        {actionLabels.add} Item
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
                        <PurchaseOrderSummary
                            form={form}
                            totals={totals}
                            grandTotal={totals.net + watchedShippingCost}
                            suppliers={suppliers}
                            selectedSupplier={selectedSupplier}
                            isLoading={isLoading}
                            mode={mode}
                        />
                    </div>
                </div>
            </form>
        </Form>
    );
}
