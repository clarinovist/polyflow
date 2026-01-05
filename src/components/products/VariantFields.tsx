'use client';

import { Control, useWatch } from 'react-hook-form';
import { CreateProductValues, ProductVariantFormValues } from '@/lib/zod-schemas';
import { Unit, ProductType } from '@prisma/client';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

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
    const variantName = useWatch({ control, name: `variants.${index}.name` });
    const primaryUnit = useWatch({ control, name: `variants.${index}.primaryUnit` });
    const salesUnit = useWatch({ control, name: `variants.${index}.salesUnit` });
    const conversionFactor = useWatch({ control, name: `variants.${index}.conversionFactor` });

    const isSimpleUnitMode = productType === ProductType.SCRAP || productType === ProductType.RAW_MATERIAL;

    const generateSKU = () => {
        if (!productType || !productName) return '';

        // 1. Get Prefix (2 chars)
        const prefixes: Record<string, string> = {
            [ProductType.RAW_MATERIAL]: 'RM',
            [ProductType.INTERMEDIATE]: 'IN',
            [ProductType.PACKAGING]: 'PK',
            [ProductType.WIP]: 'WP',
            [ProductType.FINISHED_GOOD]: 'FG',
            [ProductType.SCRAP]: 'SC',
        };
        const prefix = prefixes[productType] || 'XX';

        // 2. Get Category (3 chars) - Take alphanumeric, skip spaces, take first 3
        const namePart = productName
            .replace(/[^A-Z]/gi, '')
            .toUpperCase();

        let category = namePart.substring(0, 3);
        while (category.length < 3) {
            category += 'X';
        }

        // 3. Get Sequence (3 digits)
        const seq = (index + 1).toString().padStart(3, '0');

        return `${prefix}${category}${seq}`;
    };

    // Get conversion preview text
    const getConversionText = () => {
        if (isSimpleUnitMode || !salesUnit || !conversionFactor) {
            return 'Simple unit mode (1:1 conversion)';
        }
        return `1 ${salesUnit} = ${conversionFactor} ${primaryUnit}`;
    };

    return (
        <div className="border rounded-lg p-4 space-y-4 bg-slate-50">
            <div className="flex items-center justify-between">
                <h4 className="font-medium text-sm text-slate-700">Variant #{index + 1}</h4>
                {canRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onRemove}
                    >
                        <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
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
                                    onClick={() => {
                                        const suggestedSKU = generateSKU();
                                        if (suggestedSKU) {
                                            field.onChange(suggestedSKU);
                                        }
                                    }}
                                >
                                    Auto
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
            <div className="text-xs text-slate-500 italic">
                {getConversionText()}
            </div>
        </div>
    );
}
