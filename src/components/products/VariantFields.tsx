'use client';

import { useState } from 'react';
import { Control, useWatch, useFormContext } from 'react-hook-form';
import { CreateProductValues } from '@/lib/schemas/product';
import { Unit, ProductType } from '@prisma/client';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2, Loader2 } from 'lucide-react';
import { deleteVariant, getNextSKU } from '@/actions/product';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface VariantFieldsProps {
    control: Control<CreateProductValues>;
    index: number;
    onRemove: () => void;
    canRemove: boolean;
    units: Unit[];
    productName: string;
}

export function VariantFields({ control, index, onRemove, canRemove, units, productName }: VariantFieldsProps) {
    // Watch product type and variant name for auto-SKU generation
    const productType = useWatch({ control, name: 'productType' });
    const _variantName = useWatch({ control, name: `variants.${index}.name` });
    const primaryUnit = useWatch({ control, name: `variants.${index}.primaryUnit` });
    const salesUnit = useWatch({ control, name: `variants.${index}.salesUnit` });
    const conversionFactor = useWatch({ control, name: `variants.${index}.conversionFactor` });
    const variantId = useWatch({ control, name: `variants.${index}.id` }) as string | undefined;

    const router = useRouter();

    const isSimpleUnitMode = productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL;

    const [isGeneratingSKU, setIsGeneratingSKU] = useState(false);
    const { setValue, getValues } = useFormContext<CreateProductValues>();

    const handleAutoSKU = async () => {
        if (!productType || !productName) {
            toast.error('Please fill product name and type first');
            return;
        }

        setIsGeneratingSKU(true);
        try {
            // Get all current SKUs in the form
            const formValues = getValues();
            const currentSkus = formValues.variants?.map(v => v.skuCode).filter(Boolean) as string[] || [];

            const nextSKU = await getNextSKU(productType as ProductType, productName, currentSkus);
            setValue(`variants.${index}.skuCode`, nextSKU, { shouldValidate: true });
            toast.success('SKU generated successfully');
        } catch (error) {
            console.error('Error generating SKU:', error);
            toast.error('Failed to generate SKU');
        } finally {
            setIsGeneratingSKU(false);
        }
    };

    // Get conversion preview text
    const getConversionText = () => {
        if (isSimpleUnitMode || !salesUnit || !conversionFactor) {
            return 'Simple unit mode (1:1 conversion)';
        }
        return `1 ${salesUnit} = ${conversionFactor} ${primaryUnit}`;
    };

    return (
        <div className="border rounded-lg p-4 space-y-4 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-zinc-700 dark:text-zinc-300">Variant #{index + 1}</h4>
                {canRemove && (
                    <div className="flex items-center gap-2">
                        {variantId && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                    if (!variantId) return;
                                    // confirm
                                    if (!confirm('Delete this variant permanently? This action cannot be undone.')) return;
                                    try {
                                        const res = await deleteVariant(variantId);
                                        if (res.success) {
                                            toast.success('Variant deleted');
                                            router.push('/dashboard/products');
                                            router.refresh();
                                        } else {
                                            toast.error(res.error || 'Failed to delete variant');
                                        }
                                    } catch {
                                        toast.error('Failed to delete variant');
                                    }
                                }}
                            >
                                Delete
                            </Button>
                        )}

                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onRemove}
                        >
                            <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Variant Name */}
                <FormField
                    control={control}
                    name={`variants.${index}.name`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Variant Name</FormLabel>
                            <FormControl>
                                <Input placeholder="e.g., Bal Isi 10" {...field} />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* SKU Code with Auto-Generate */}
                <FormField
                    control={control}
                    name={`variants.${index}.skuCode`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>SKU Code</FormLabel>
                            <div className="flex gap-2">
                                <FormControl>
                                    <Input placeholder="e.g., RMPPK001" {...field} />
                                </FormControl>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAutoSKU}
                                    disabled={isGeneratingSKU}
                                >
                                    {isGeneratingSKU ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        'Auto'
                                    )}
                                </Button>
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Primary Unit */}
                <FormField
                    control={control}
                    name={`variants.${index}.primaryUnit`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Primary Unit</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select primary unit" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {units.map((unit) => (
                                        <SelectItem key={unit} value={unit}>
                                            {unit}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Sales Unit - Hidden for SCRAP/RAW_MATERIAL */}
                {!isSimpleUnitMode && (
                    <FormField
                        control={control}
                        name={`variants.${index}.salesUnit`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Sales Unit</FormLabel>
                                <Select
                                    onValueChange={field.onChange}
                                    value={field.value || primaryUnit || ''}
                                >
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select sales unit" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {units.map((unit) => (
                                            <SelectItem key={unit} value={unit}>
                                                {unit}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {/* Conversion Factor - Hidden for SCRAP/RAW_MATERIAL */}
                {!isSimpleUnitMode && (
                    <FormField
                        control={control}
                        name={`variants.${index}.conversionFactor`}
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Conversion Factor</FormLabel>
                                <FormControl>
                                    <Input
                                        type="number"
                                        step="0.0001"
                                        placeholder="1"
                                        {...field}
                                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {/* Price Fields */}
                <FormField
                    control={control}
                    name={`variants.${index}.price`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Reference Price</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Min Stock Alert */}
                <FormField
                    control={control}
                    name={`variants.${index}.minStockAlert`}
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Min Stock Alert (Optional)</FormLabel>
                            <FormControl>
                                <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="0"
                                    value={field.value || ''}
                                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            {/* Conversion Preview */}
            <div className="text-xs text-zinc-500 dark:text-zinc-400 italic">
                {getConversionText()}
            </div>
        </div>
    );
}
