import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { TableCell } from '@/components/ui/table';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Settings } from 'lucide-react';
import { formatRupiah } from '@/lib/utils/utils';
import { DEFAULT_PPN_PERCENT } from '@/lib/utils/ppn';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import type { PurchaseOrderTaxProps } from './types';

export function PurchaseOrderDesktopTax({
    form,
    index,
    taxableItems,
    setTaxableItems,
    ppnResult,
}: PurchaseOrderTaxProps) {
    return (
        <TableCell className="pt-3">
            <div className="flex items-center justify-center gap-1 mt-1.5">
                <Checkbox
                    id={`taxable-po-table-${index}`}
                    checked={taxableItems[index] ?? false}
                    onCheckedChange={(checked) => {
                        setTaxableItems((prev) => ({
                            ...prev,
                            [index]: !!checked,
                        }));
                        if (!checked) {
                            form.setValue(`items.${index}.taxPercent`, 0);
                            form.setValue(
                                `items.${index}.dppOtherAmount`,
                                null,
                            );
                        } else {
                            const currentTax = Number(
                                form.getValues(`items.${index}.taxPercent`) ||
                                    0,
                            );
                            if (currentTax === 0) {
                                form.setValue(
                                    `items.${index}.taxPercent`,
                                    DEFAULT_PPN_PERCENT,
                                );
                            }
                            // Default to INCLUDE if no mode set
                            const currentMode = form.getValues(
                                `items.${index}.ppnMode`,
                            );
                            if (!currentMode || currentMode === 'EXCLUDE') {
                                form.setValue(
                                    `items.${index}.ppnMode`,
                                    'INCLUDE',
                                );
                            }
                        }
                    }}
                />
                <label
                    htmlFor={`taxable-po-table-${index}`}
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
                        <PopoverContent
                            className="w-80 p-4 space-y-4"
                            align="end"
                        >
                            <h4 className="font-medium text-sm border-b pb-2">
                                Opsi Pajak Lanjutan
                            </h4>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">
                                    Mode PPN
                                </Label>
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
                                                <RadioGroupItem
                                                    value="EXCLUDE"
                                                    id={`ppn-excl-pop-${index}`}
                                                />
                                                <Label
                                                    htmlFor={`ppn-excl-pop-${index}`}
                                                    className="text-xs cursor-pointer"
                                                >
                                                    Exclude (harga + pajak)
                                                </Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <RadioGroupItem
                                                    value="INCLUDE"
                                                    id={`ppn-incl-pop-${index}`}
                                                />
                                                <Label
                                                    htmlFor={`ppn-incl-pop-${index}`}
                                                    className="text-xs cursor-pointer"
                                                >
                                                    Include (harga termasuk)
                                                </Label>
                                            </div>
                                        </RadioGroup>
                                    )}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">
                                    Tarif Pajak (%)
                                </Label>
                                <div className="flex items-center gap-2">
                                    <FormField
                                        control={form.control}
                                        name={`items.${index}.taxPercent`}
                                        render={({ field: taxField }) => (
                                            <Input
                                                type="number"
                                                min="0"
                                                max="100"
                                                className="h-8 w-20 text-center font-mono text-sm"
                                                {...taxField}
                                                onChange={(e) =>
                                                    taxField.onChange(
                                                        Number(e.target.value),
                                                    )
                                                }
                                            />
                                        )}
                                    />
                                    <span className="text-xs text-muted-foreground">
                                        %
                                    </span>
                                    <span className="text-xs font-mono text-muted-foreground ml-auto">
                                        {ppnResult.taxAmount > 0
                                            ? formatRupiah(ppnResult.taxAmount)
                                            : 'Rp 0'}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-xs text-muted-foreground">
                                    DPP (Dasar Pengenaan Pajak)
                                </Label>
                                <FormField
                                    control={form.control}
                                    name={`items.${index}.dppOtherAmount`}
                                    render={({ field: dppField }) => (
                                        <div className="relative">
                                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                                                Rp
                                            </span>
                                            <Input
                                                type="text"
                                                inputMode="decimal"
                                                placeholder="Auto (11/12)"
                                                value={dppField.value ?? ''}
                                                onChange={(e) => {
                                                    const normalized =
                                                        e.target.value.replace(
                                                            ',',
                                                            '.',
                                                        );
                                                    const num =
                                                        Number(normalized);
                                                    dppField.onChange(
                                                        e.target.value === ''
                                                            ? null
                                                            : isNaN(num)
                                                              ? 0
                                                              : num,
                                                    );
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
    );
}
