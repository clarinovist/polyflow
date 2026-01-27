'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Loader2, AlertTriangle, Hammer, CheckCircle2, ArrowRight } from 'lucide-react';
import { checkSalesOrderFulfillment } from '@/actions/sales';

import Link from 'next/link';
import { ProductionOrder } from '@prisma/client';

// Define localized serialized type if not shared, or use partial
type SerializedProductionOrder = Omit<ProductionOrder, 'plannedQuantity' | 'actualQuantity' | 'plannedStartDate' | 'plannedEndDate' | 'actualStartDate' | 'actualEndDate' | 'createdAt' | 'updatedAt'> & {
    plannedQuantity: number;
    actualQuantity: number | null;
    plannedStartDate: Date | string;
    plannedEndDate: Date | string | null;
    actualStartDate: Date | string | null;
    actualEndDate: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
};

interface Shortage {
    productVariantId: string;
    required: number;
    available: number;
    shortage: number;
}

interface ProductionStatusCardProps {
    salesOrderId: string;
    status: string;
    productionOrders: SerializedProductionOrder[];
    items: {
        productVariantId: string;
        productVariant: {
            product: {
                name: string;
            };
        };
    }[];
}

export function ProductionStatusCard({ salesOrderId, status: _status, productionOrders, items }: ProductionStatusCardProps) {
    const [shortages, setShortages] = useState<Shortage[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchShortages = async () => {
            setIsLoading(true);
            const result = await checkSalesOrderFulfillment(salesOrderId);
            if (isMounted) {
                if (result.success && result.data) {
                    setShortages(result.data.shortages);
                }
                setIsLoading(false);
            }
        };

        fetchShortages();

        return () => {
            isMounted = false;
        };
    }, [salesOrderId]);



    // Calculate overall production progress
    const totalPlanned = productionOrders.reduce((sum, po) => sum + Number(po.plannedQuantity), 0);
    const totalActual = productionOrders.reduce((sum, po) => sum + Number(po.actualQuantity || 0), 0);
    const progress = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;

    return (
        <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/20 dark:border-amber-800">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Hammer className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                            Production Status
                        </CardTitle>
                        <CardDescription>Track and manage manufacturing for this order</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : shortages.length > 0 ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 text-amber-700 bg-amber-100 dark:bg-amber-900/40 dark:text-amber-400 p-2 rounded text-sm font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            Stock Shortage Detected
                        </div>
                        <div className="space-y-2">
                            {shortages.map((s) => {
                                const itemInfo = items.find(i => i.productVariantId === s.productVariantId);
                                return (
                                    <div key={s.productVariantId} className="flex justify-between items-center text-sm border-b dark:border-amber-800/30 pb-2 last:border-0">
                                        <div>
                                            <div className="font-medium">{itemInfo?.productVariant?.product?.name || 'Item'}</div>
                                            <div className="text-xs text-muted-foreground flex gap-2">
                                                <span>Avail: {s.available}</span>
                                                <span className="text-red-500 dark:text-red-500 font-medium">Need: {s.shortage}</span>
                                            </div>
                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 p-2 rounded text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4" />
                        Stock is sufficient for fulfillment
                    </div>
                )}

                {productionOrders.length > 0 && (
                    <div className="pt-2 border-t dark:border-amber-800/30 mt-4 space-y-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Linked Orders</h4>
                        <div className="space-y-3">
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                <div
                                    className="bg-amber-500 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground font-medium uppercase px-1">
                                <span>Progress</span>
                                <span>{Math.round(progress)}% Complete</span>
                            </div>

                            <ul className="space-y-2">
                                {productionOrders.map((po) => (
                                    <li key={po.id} className="bg-white dark:bg-slate-900 p-2 rounded border border-amber-100 dark:border-amber-900/50 text-xs shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold">{po.orderNumber}</span>
                                            <Badge variant="outline" className="text-[10px] h-4 py-0 border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                                                {po.status}
                                            </Badge>
                                        </div>
                                        <div className="flex justify-between text-muted-foreground">
                                            <span>Qty: {Number(po.actualQuantity || 0)} / {Number(po.plannedQuantity)}</span>
                                            <Link href={`/production/orders/${po.id}`} className="text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:underline">
                                                details <ArrowRight className="h-3 w-3" />
                                            </Link>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
