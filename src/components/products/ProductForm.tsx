'use client';

import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createProductSchema, updateProductSchema, CreateProductValues, UpdateProductValues } from '@/lib/schemas/product';
import { createProduct, updateProduct } from '@/actions/product';
import { ProductType, Unit } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { VariantFields } from './VariantFields';
import { useEffect } from 'react';

interface ProductFormProps {
    mode: 'create' | 'edit';
    productTypes: ProductType[];
    units: Unit[];
    initialData?: UpdateProductValues;
}

const productTypeLabels: Record<ProductType, string> = {
    RAW_MATERIAL: 'Raw Material',
    FINISHED_GOOD: 'Finished Good',
    SCRAP: 'Scrap',
    INTERMEDIATE: 'Intermediate',
    PACKAGING: 'Packaging',
    WIP: 'Work In Progress',
};

export function ProductForm({ mode, productTypes, units, initialData }: ProductFormProps) {
    const router = useRouter();

    const form = useForm<CreateProductValues | UpdateProductValues>({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        resolver: zodResolver(mode === 'create' ? createProductSchema : updateProductSchema) as any,
        defaultValues: initialData || {
            name: '',
            productType: undefined,
            variants: [
                {
                    name: '',
                    skuCode: '',
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1,
                    minStockAlert: null,
                },
            ],
        },
    });

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'variants',
    });

    const productType = useWatch({ control: form.control, name: 'productType' });
    const productName = useWatch({ control: form.control, name: 'name' });

    // Auto-adjust variant units when product type changes to SCRAP or RAW_MATERIAL
    useEffect(() => {
        if (productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL) {
            const variants = form.getValues('variants');
            variants.forEach((variant, index) => {
                const primaryUnit = variant.primaryUnit || Unit.KG;
                form.setValue(`variants.${index}.salesUnit`, primaryUnit);
                form.setValue(`variants.${index}.conversionFactor`, 1);
            });
        }
    }, [productType, form]);

    const addVariant = () => {
        const isSimpleMode = productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL;
        append({
            name: '',
            skuCode: '',
            primaryUnit: Unit.KG,
            salesUnit: isSimpleMode ? Unit.KG : Unit.KG,
            conversionFactor: 1,
            minStockAlert: null,
        });
    };

    async function onSubmit(data: CreateProductValues | UpdateProductValues) {
        const result = mode === 'create'
            ? await createProduct(data as CreateProductValues)
            : await updateProduct(data as UpdateProductValues);

        if (result.success) {
            toast.success(`Product ${mode === 'create' ? 'created' : 'updated'} successfully`);
            router.push('/dashboard/products');
            router.refresh();
        } else {
            toast.error(result.error || `Failed to ${mode} product`);
        }
    }

    return (
        <Form {...form}>
            <form
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onSubmit={form.handleSubmit(onSubmit as any)}
                className="space-y-8"
            >
                {/* General Info Section */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold">General Information</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                        {/* Product Name */}
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Product Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="e.g., Plastik HDPE" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Product Type */}
                        <FormField
                            control={form.control}
                            name="productType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Product Type</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value || ''}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select product type" />
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

                    {/* Smart Mode Info - Outside grid to avoid layout issues */}
                    {(productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL) && (
                        <p className="text-xs text-blue-600 mt-2">
                            Smart mode enabled: Variants will use simple 1:1 unit conversion
                        </p>
                    )}
                </div>

                {/* Variants Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Product Variants</h3>
                        <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Variant
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
                            <p className="text-slate-500 text-sm">No variants added yet</p>
                            <Button type="button" variant="outline" size="sm" onClick={addVariant} className="mt-4">
                                <Plus className="h-4 w-4 mr-2" />
                                Add First Variant
                            </Button>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <div className="flex justify-end gap-4">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.push('/dashboard/products')}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" disabled={form.formState.isSubmitting}>
                        {form.formState.isSubmitting
                            ? mode === 'create' ? 'Creating...' : 'Updating...'
                            : mode === 'create' ? 'Create Product' : 'Update Product'}
                    </Button>
                </div>
            </form>
        </Form>
    );
}
