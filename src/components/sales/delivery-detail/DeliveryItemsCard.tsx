import type { DeliveryOrderDetailData } from './types';
import type { Dispatch, SetStateAction } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { salesLabels, formLabels } from '@/lib/labels';
import { getEnteredQuantityDisplay } from '@/lib/utils/production-units';

interface DeliveryItemsCardProps {
    items: DeliveryOrderDetailData['items'];
    canEditQty: boolean;
    editingQty: boolean;
    savingQty: boolean;
    qtyDraft: Record<string, string>;
    notesDraft: Record<string, string>;
    setQtyDraft: Dispatch<SetStateAction<Record<string, string>>>;
    setNotesDraft: Dispatch<SetStateAction<Record<string, string>>>;
    setEditingQty: Dispatch<SetStateAction<boolean>>;
    startEditQty: () => void;
    handleSaveQty: () => Promise<void>;
}

export function DeliveryItemsCard({
    items,
    canEditQty,
    editingQty,
    savingQty,
    qtyDraft,
    notesDraft,
    setQtyDraft,
    setNotesDraft,
    setEditingQty,
    startEditQty,
    handleSaveQty,
}: DeliveryItemsCardProps) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                    <CardTitle>Item Pengiriman</CardTitle>
                    <CardDescription>
                        {canEditQty
                            ? salesLabels.sjQtyHelp
                            : 'Item yang termasuk dalam batch pengiriman ini'}
                    </CardDescription>
                </div>
                {canEditQty && !editingQty && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={startEditQty}
                    >
                        {salesLabels.editSjQty}
                    </Button>
                )}
                {canEditQty && editingQty && (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={savingQty}
                            onClick={() => setEditingQty(false)}
                        >
                            Batal
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={savingQty}
                            onClick={handleSaveQty}
                        >
                            {savingQty ? 'Menyimpan…' : salesLabels.saveSjQty}
                        </Button>
                    </div>
                )}
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="h-10 px-4 text-left font-medium">
                                    {formLabels.product}
                                </th>
                                <th className="h-10 px-4 text-right font-medium">
                                    SKU
                                </th>
                                <th className="h-10 px-4 text-right font-medium">
                                    {formLabels.qty}
                                </th>
                                <th className="h-10 px-4 text-left font-medium">
                                    {salesLabels.sjItemNotesLabel}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {items.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/50">
                                    <td className="p-4">
                                        <div className="font-medium">
                                            {item.productVariant?.product?.name}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {item.productVariant?.name}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right font-mono text-xs">
                                        {item.productVariant?.skuCode}
                                    </td>
                                    <td className="p-4 text-right font-medium">
                                        {editingQty ? (
                                            <div className="inline-flex items-center gap-1.5 justify-end">
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    min="0.01"
                                                    className="h-8 w-28 text-right"
                                                    value={
                                                        qtyDraft[item.id] ?? ''
                                                    }
                                                    onChange={(e) =>
                                                        setQtyDraft((prev) => ({
                                                            ...prev,
                                                            [item.id]:
                                                                e.target.value,
                                                        }))
                                                    }
                                                />
                                                <span className="text-xs text-muted-foreground">
                                                    {item.enteredUnit ||
                                                        item.productVariant
                                                            ?.primaryUnit ||
                                                        ''}
                                                </span>
                                            </div>
                                        ) : (
                                            getEnteredQuantityDisplay({
                                                ...item,
                                                ...item.productVariant,
                                            } as unknown as import('@/lib/utils/production-units').EnteredQuantitySnapshot)
                                        )}
                                    </td>
                                    <td className="p-4 text-left">
                                        {editingQty ? (
                                            <Input
                                                type="text"
                                                maxLength={200}
                                                className="h-8 w-full min-w-[10rem]"
                                                placeholder={
                                                    salesLabels.sjItemNotesPlaceholder
                                                }
                                                value={
                                                    notesDraft[item.id] ?? ''
                                                }
                                                onChange={(e) =>
                                                    setNotesDraft((prev) => ({
                                                        ...prev,
                                                        [item.id]:
                                                            e.target.value,
                                                    }))
                                                }
                                            />
                                        ) : (
                                            <span className="text-muted-foreground">
                                                {item.notes || '-'}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
