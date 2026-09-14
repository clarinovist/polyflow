import { Package } from 'lucide-react';
import type { SchedulableSO } from './types';

interface SalesOrderDetailsProps {
    so: SchedulableSO;
}

export function SalesOrderDetails({ so }: SalesOrderDetailsProps) {
    return (
        <div className="p-3 bg-muted/50 rounded-md border border-border/50 text-xs">
            <p className="font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" />{' '}
                Detail Barang & Sisa Qty di SO:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {so.items.map((item) => {
                    const rem =
                        Number(item.quantity) -
                        Number(
                            item.deliveredQty,
                        );
                    return (
                        <div
                            key={item.id}
                            className="flex justify-between border-b border-border/30 pb-1"
                        >
                            <span className="font-medium text-foreground">
                                {
                                    item
                                        .productVariant
                                        .name
                                }
                            </span>
                            <span className="text-muted-foreground">
                                {rem.toLocaleString(
                                    'id-ID',
                                )}{' '}
                                /{' '}
                                {Number(
                                    item.quantity,
                                ).toLocaleString(
                                    'id-ID',
                                )}{' '}
                                {
                                    item
                                        .productVariant
                                        .primaryUnit
                                }
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
