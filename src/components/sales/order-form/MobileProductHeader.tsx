import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form';
import { cn } from '@/lib/utils/utils';
import { Trash2, Check } from 'lucide-react';
import type { getProductionUnitMeta } from '@/lib/utils/production-units';
import type { SerializedProductVariant } from '../sales-order-types';
import type { Dispatch, SetStateAction } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { SalesOrderFormValues } from './types';

type MobileProductHeaderProps = {
    form: UseFormReturn<SalesOrderFormValues>;
    index: number;
    setMobileProductSearch: Dispatch<
        SetStateAction<{ open: boolean; index: number }>
    >;
    CUSTOM_ITEM_PREFIX: string;
    customItems: { tempId: string; name: string; sellPrice: number }[];
    filteredProducts: SerializedProductVariant[];
    variant: SerializedProductVariant | undefined;
    unitMeta: ReturnType<typeof getProductionUnitMeta> | null;
    handleRemoveItem: (index: number) => void;
};

export function MobileProductHeader({
    form,
    index,
    setMobileProductSearch,
    CUSTOM_ITEM_PREFIX,
    customItems,
    filteredProducts,
    variant,
    unitMeta,
    handleRemoveItem,
}: MobileProductHeaderProps) {
    return (
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
                                'w-full justify-between h-11 text-left font-normal',
                                !productField.value && 'text-muted-foreground',
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
                                                  (c) =>
                                                      c.tempId ===
                                                      productField.value,
                                              );
                                              return custom
                                                  ? `✏️ ${custom.name}`
                                                  : 'Pilih Produk';
                                          })()
                                        : (() => {
                                              const p = filteredProducts.find(
                                                  (
                                                      pv: SerializedProductVariant,
                                                  ) =>
                                                      pv.id ===
                                                      productField.value,
                                              );
                                              return p
                                                  ? p.product.name === p.name
                                                      ? p.name
                                                      : `${p.product.name} - ${p.name}`
                                                  : 'Pilih Produk';
                                          })()
                                    : 'Pilih Produk'}
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
    );
}
