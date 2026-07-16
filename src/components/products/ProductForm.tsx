'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductSchema, updateProductSchema, CreateProductValues, UpdateProductValues } from '@/lib/schemas/product';
import { createProduct, updateProduct } from '@/actions/product';
import { ProductType, Unit, AssetCategory } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Plus, AlertTriangle } from 'lucide-react';
import { VariantFields } from './VariantFields';
import { useEffect } from 'react';
import { productTypeLabels, productFormLabels, assetCategoryLabels, defaultUsefulLifeMonths } from '@/lib/labels/products';

type FixedAssetAccount = { id: string; code: string; name: string };

interface ProductFormProps {
    mode: 'create' | 'edit';
    productTypes: ProductType[];
    units: Unit[];
    initialData?: UpdateProductValues;
    fixedAssetAccounts?: FixedAssetAccount[];
}

export function ProductForm({ mode, productTypes, units, initialData, fixedAssetAccounts }: ProductFormProps) {
    const router = useRouter();
    const accounts = fixedAssetAccounts || [];

    const form = useForm<CreateProductValues | UpdateProductValues>({
        resolver: zodResolver(mode === 'create' ? createProductSchema : updateProductSchema) as unknown as never,
        defaultValues: (initialData || {
            name: '',
            productType: undefined,
            assetCategory: undefined,
            usefulLifeMonths: 60,
            inventoryAccountId: undefined,
            variants: [
                {
                    name: '',
                    skuCode: '',
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1,
                    minStockAlert: null,
                    consumptionRule: null,
                },
            ],
        }) as unknown as never,
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'variants',
    });

    const productType = (useWatch as unknown as (opts: unknown) => unknown)({ control: form.control, name: 'productType' }) as ProductType | undefined;
    const productName = (useWatch as unknown as (opts: unknown) => unknown)({ control: form.control, name: 'name' }) as string;
    const assetCategory = (useWatch as unknown as (opts: unknown) => unknown)({ control: form.control, name: 'assetCategory' }) as AssetCategory | undefined;

    useEffect(() => {
        const variants = form.getValues('variants');
        if (productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL) {
            variants.forEach((variant, index) => {
                const primaryUnit = variant.primaryUnit || Unit.KG;
                form.setValue(`variants.${index}.salesUnit`, primaryUnit);
                form.setValue(`variants.${index}.conversionFactor`, 1);
            });
        }
        if (productType !== ProductType.PACKAGING) {
            variants.forEach((_, index) => {
                form.setValue(`variants.${index}.consumptionRule`, null);
            });
        }
    }, [productType, form]);

    useEffect(() => {
        if (productType === ProductType.FIXED_ASSET && assetCategory) {
            const vals = form.getValues() as unknown as { usefulLifeMonths?: number };
            const current = vals.usefulLifeMonths;
            const def = defaultUsefulLifeMonths[assetCategory];
            if (!current) {
                form.setValue('usefulLifeMonths' as unknown as never, def as never);
            }
        }
    }, [assetCategory, productType, form]);

    const addVariant = () => {
        const isSimpleMode = productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL;
        append({
            name: '',
            skuCode: '',
            primaryUnit: Unit.KG,
            salesUnit: isSimpleMode ? Unit.KG : Unit.KG,
            conversionFactor: 1,
            minStockAlert: null,
            consumptionRule: null,
        });
    };

    async function onSubmit(data: CreateProductValues | UpdateProductValues) {
        const result = mode === 'create'
            ? await createProduct(data as CreateProductValues)
            : await updateProduct(data as UpdateProductValues);
        if (result.success) {
            toast.success(`Produk berhasil ${mode === 'create' ? 'dibuat' : 'diperbarui'}.`);
            router.push('/dashboard/products');
            router.refresh();
        } else {
            toast.error(result.error || `Gagal ${mode === 'create' ? 'membuat' : 'memperbarui'} produk.`);
        }
    }

    return (
        <Form {...form}>
            <form
                onSubmit={form.handleSubmit(onSubmit as unknown as never)}
                className="space-y-8"
            >
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">{productFormLabels.generalInfo}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{productFormLabels.productName}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={productFormLabels.productNamePlaceholder} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="productType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{productFormLabels.productType}</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={productFormLabels.selectProductType} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {productTypes.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {productTypeLabels[type]}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                    {(productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL) && (
                        <p className="text-xs text-blue-600 mt-2">
                            {productFormLabels.smartModeInfo}
                        </p>
                    )}
                    {productType === ProductType.FIXED_ASSET && (
                        <>
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <div>
                                    <p className="font-medium">Aset Tetap tidak masuk stok gudang</p>
                                    <p className="text-amber-700/80 dark:text-amber-200/70">Pengakuan akuntansi saat Goods Receipt. Lokasi fisik dicatat di kartu aset. Akun aset wajib dipilih.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <FormField
                                    control={form.control}
                                    name={'assetCategory' as unknown as never}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Kategori Aset</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value as string || ''}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Pilih kategori" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {Object.values(AssetCategory).map((cat) => (
                                                        <SelectItem key={cat} value={cat}>
                                                            {assetCategoryLabels[cat as AssetCategory]}
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
                                    name={'usefulLifeMonths' as unknown as never}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Umur Manfaat (bulan)</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={1} max={1200} placeholder="60" {...field} value={(field.value as number | undefined) ?? ''} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)} />
                                            </FormControl>
                                            <FormDescription className="text-[10px]">Default: Mesin/Peralatan/Lain 60, Kendaraan 48, Bangunan 240. Bisa custom.</FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name={'inventoryAccountId' as unknown as never}
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Akun Aset Tetap (Wajib)</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value as string || ''}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={accounts.length === 0 ? 'Tidak ada akun FIXED_ASSET' : 'Pilih akun aset'} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {accounts.map((a) => (
                                                        <SelectItem key={a.id} value={a.id}>
                                                            {a.code} - {a.name}
                                                        </SelectItem>
                                                    ))}
                                                    {accounts.length === 0 && (
                                                        <SelectItem value="__empty" disabled>Tidak ada akun FIXED_ASSET. Buat di COA dulu.</SelectItem>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </>
                    )}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">{productFormLabels.productVariants}</h3>
                        <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                            <Plus className="h-4 w-4 mr-2" />
                            {productFormLabels.addVariant}
                        </Button>
                    </div>
                    <div className="space-y-4">
                        {fields.map((field, index) => (
                            <VariantFields
                                key={field.id}
                                control={form.control}
                                index={index}
                                onRemove={() => remove(index)}
                                canRemove={fields.length > 1}
                                units={units}
                                productName={productName}
                            />
                        ))}
                    </div>
                    {fields.length === 0 && (
                        <div className="text-center py-8 border border-dashed rounded-lg">
                            <p className="text-slate-500 text-sm">{productFormLabels.noVariants}</p>
                            <Button type="button" variant="outline" size="sm" onClick={addVariant} className="mt-4">
                                <Plus className="h-4 w-4 mr-2" />
                                {productFormLabels.addFirstVariant}
                            </Button>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push('/dashboard/products')}
                    >
                        {productFormLabels.cancel}
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting
                            ? mode === 'create' ? productFormLabels.creating : productFormLabels.updating
                            : mode === 'create' ? productFormLabels.createProduct : productFormLabels.updateProduct}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
