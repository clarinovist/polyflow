'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Package, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { Location, ProductVariant } from '@prisma/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { BatchIssueMaterialDialog } from '@/components/production/order-detail/BatchIssueMaterialDialog';

interface WarehouseOrderCardProps {
    order: ExtendedProductionOrder;
    locations: Location[];
    rawMaterials: ProductVariant[];
}

export default function WarehouseOrderCard({
    order,
    locations,
    rawMaterials
}: WarehouseOrderCardProps) {
    const plannedMaterials = order.plannedMaterials || [];
    const materialIssues = order.materialIssues || [];

    // Calculate overall fulfillment progress
    const totalRequired = plannedMaterials.reduce((sum, pm) => sum + Number(pm.quantity), 0);
    const totalIssued = materialIssues.reduce((sum, mi) => sum + Number(mi.quantity), 0);
    const fulfillmentProgress = totalRequired > 0 ? (totalIssued / totalRequired) * 100 : 0;

    const isFullyIssued = fulfillmentProgress >= 99.9;

    // Groups materials for summary
    const materialItems = plannedMaterials.map(pm => {
        const issued = materialIssues
            .filter(mi => mi.productVariantId === pm.productVariantId)
            .reduce((sum, mi) => sum + Number(mi.quantity), 0);
        return {
            name: pm.productVariant.name,
            required: Number(pm.quantity),
            issued,
            unit: pm.productVariant.primaryUnit
        };
    });

    return (
        <Card className={cn(
            "overflow-hidden border-l-4 shadow-sm active:scale-[0.99] transition-all",
            isFullyIssued ? "border-l-emerald-500 bg-emerald-50/10" : "border-l-orange-500 bg-white"
        )}>
            <CardContent className="p-0">
                <div className="p-4 sm:p-5">
                    {/* Header: SPK # and Status */}
                    <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-slate-900 leading-none">{order.orderNumber}</h3>
                                <Badge className={cn(
                                    "text-[10px] font-bold px-2 py-0.5",
                                    order.status === 'RELEASED' ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                                )}>
                                    {order.status}
                                </Badge>
                            </div>
                            <p className="text-sm font-medium text-slate-600 flex items-center gap-1">
                                <Package className="w-3.5 h-3.5" />
                                {order.bom.productVariant.product.name}
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Planned Start</span>
                                <span className="text-xs font-bold text-slate-700">{format(new Date(order.plannedStartDate), 'MMM d, p')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Material Progress Bar */}
                    <div className="space-y-2 mb-4">
                        <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-slate-500">Material Fulfillment</span>
                            <span className={cn(
                                "text-xs font-black",
                                isFullyIssued ? "text-emerald-600" : "text-orange-600"
                            )}>
                                {fulfillmentProgress.toFixed(0)}%
                            </span>
                        </div>
                        <Progress value={fulfillmentProgress} className={cn(
                            "h-2",
                            isFullyIssued ? "[&>div]:bg-emerald-500" : "[&>div]:bg-orange-500"
                        )} />
                    </div>

                    {/* Detail Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-5 p-3 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Machine
                            </span>
                            <p className="text-xs font-black text-slate-800 truncate">{order.machine?.name || 'Generic'}</p>
                        </div>
                        <div className="space-y-1 text-right">
                            <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 justify-end">
                                <Clock className="w-3 h-3" /> Priority
                            </span>
                            <p className="text-xs font-black text-slate-800">Normal</p>
                        </div>
                    </div>

                    {/* Materials List (Shortened) */}
                    <div className="space-y-2.5 mb-6">
                        {materialItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-slate-100 shadow-sm">
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-900">{item.name}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Req: {item.required} {item.unit}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={cn(
                                        "text-xs font-black",
                                        item.issued >= item.required ? "text-emerald-600" : "text-slate-600"
                                    )}>
                                        {item.issued} / {item.required}
                                    </span>
                                    {item.issued >= item.required ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full border-2 border-slate-200" />
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                        <BatchIssueMaterialDialog
                            order={order}
                            locations={locations}
                            rawMaterials={rawMaterials}
                        />
                        <Button variant="ghost" size="sm" className="flex-1 text-slate-400 font-bold text-xs" disabled>
                            Print Pick List
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
