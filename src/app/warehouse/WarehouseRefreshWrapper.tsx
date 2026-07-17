'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { Clock, MapPin, CheckCircle2, Copy, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ConsolidatedIssueDialog } from '@/components/warehouse/ConsolidatedIssueDialog';
import { Location, Employee as PrismaEmployee, ProductVariant, Machine, WorkShift } from '@prisma/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/utils";
import { format } from 'date-fns';
import { BatchIssueMaterialDialog } from '@/components/production/order-detail/BatchIssueMaterialDialog';
import { AdHocMaterialUsageDialog } from '@/components/production/order-detail/AdHocMaterialUsageDialog';
import { ResponsiveTable } from '@/components/ui/responsive-table';
import { warehouseLabels } from '@/lib/labels';
import { resolveMaterialPath } from '@/lib/production/material-path';

/**
 * Shorten an order number by showing only the last 3 dash-separated segments.
 * E.g. "IMP-RAF-202601-EKS-KW1-RAFIA-BIRU-KW" → "RAFIA-BIRU-KW"
 * If <= 4 segments, returns the full ID unchanged.
 */
function shortOrderId(orderNumber: string): string {
    const segments = orderNumber.split('-');
    if (segments.length <= 4) return orderNumber;
    return segments.slice(-3).join('-');
}

type QueueFilter = 'all' | 'rm' | 'wip';

function orderPath(order: ExtendedProductionOrder): 'warehouse_rm' | 'floor_wip' {
    return resolveMaterialPath(order.bom?.category);
}

interface WarehouseRefreshWrapperProps {
    initialOrders: ExtendedProductionOrder[];
    formData: {
        locations: Location[];
        operators: PrismaEmployee[];
        helpers: PrismaEmployee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
    };
}

export default function WarehouseRefreshWrapper({
    initialOrders,
    formData
}: WarehouseRefreshWrapperProps) {
    const router = useRouter();
    const [isConsolDialogOpen, setIsConsolDialogOpen] = useState(false);
    const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');

    // Auto-refresh logic (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            router.refresh();
        }, 30000);
        return () => clearInterval(interval);
    }, [router]);

    const counts = useMemo(() => {
        let rm = 0;
        let wip = 0;
        for (const o of initialOrders) {
            if (orderPath(o) === 'warehouse_rm') rm += 1;
            else wip += 1;
        }
        return { all: initialOrders.length, rm, wip };
    }, [initialOrders]);

    const filteredOrders = useMemo(() => {
        if (queueFilter === 'rm') {
            return initialOrders.filter((o) => orderPath(o) === 'warehouse_rm');
        }
        if (queueFilter === 'wip') {
            return initialOrders.filter((o) => orderPath(o) === 'floor_wip');
        }
        return initialOrders;
    }, [initialOrders, queueFilter]);

    const emptyMessage =
        queueFilter === 'rm'
            ? warehouseLabels.filterEmptyRm
            : queueFilter === 'wip'
              ? warehouseLabels.filterEmptyWip
              : warehouseLabels.filterEmptyAll;

    // --- Main Content UI ---
    return (
        <>
            <Card className="h-full flex flex-col min-h-0 shadow-sm">
                <CardContent className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-2 pb-2 border-b dark:border-slate-800">
                            <div className="flex justify-between items-center">
                                <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="w-4 h-4 text-amber-500" /> {warehouseLabels.openActiveSpkQueue}
                                </h2>
                                <Button
                                    onClick={() => setIsConsolDialogOpen(true)}
                                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8 gap-1.5"
                                >
                                    <ClipboardList className="w-3.5 h-3.5" /> Gabungkan Pengambilan
                                </Button>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-3xl">
                                <span className="font-semibold text-foreground/80">{warehouseLabels.pathATitle}. </span>
                                {warehouseLabels.pathAHelp}
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {(
                                    [
                                        { id: 'all' as const, label: warehouseLabels.filterAll, count: counts.all },
                                        { id: 'rm' as const, label: warehouseLabels.filterRm, count: counts.rm },
                                        { id: 'wip' as const, label: warehouseLabels.filterWip, count: counts.wip },
                                    ] as const
                                ).map((chip) => (
                                    <Button
                                        key={chip.id}
                                        type="button"
                                        size="sm"
                                        variant={queueFilter === chip.id ? 'default' : 'outline'}
                                        className={cn(
                                            'h-7 text-xs gap-1.5',
                                            queueFilter === chip.id && chip.id === 'rm' && 'bg-amber-600 hover:bg-amber-700',
                                            queueFilter === chip.id && chip.id === 'wip' && 'bg-sky-600 hover:bg-sky-700',
                                        )}
                                        onClick={() => setQueueFilter(chip.id)}
                                    >
                                        {chip.label}
                                        <Badge
                                            variant="secondary"
                                            className={cn(
                                                'h-5 min-w-5 px-1.5 text-[10px] font-bold',
                                                queueFilter === chip.id && 'bg-white/20 text-white hover:bg-white/20',
                                            )}
                                        >
                                            {chip.count}
                                        </Badge>
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {filteredOrders.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic py-8 text-center">
                                {emptyMessage}
                            </p>
                        ) : null}

                        <Accordion type="single" collapsible className="w-full space-y-2">
                        {filteredOrders.map(order => {
                            const path = orderPath(order);
                            const isRmPath = path === 'warehouse_rm';
                            const plannedMaterials = order.plannedMaterials || [];
                            const materialIssues = order.materialIssues || [];

                            // Calculate overall fulfillment progress
                            const totalRequired = plannedMaterials.reduce((sum, pm) => sum + Number(pm.quantity), 0);
                            const totalIssued = materialIssues
                                .filter(mi => mi.status !== 'VOIDED')
                                .reduce((sum, mi) => sum + Number(mi.quantity), 0);
                            const fulfillmentProgress = totalRequired > 0 ? (totalIssued / totalRequired) * 100 : 0;
                            const isFullyIssued = fulfillmentProgress >= 99.9;

                            const materialItems = plannedMaterials.map(pm => {
                                const issued = materialIssues
                                    .filter(mi => mi.productVariantId === pm.productVariantId && mi.status !== 'VOIDED')
                                    .reduce((sum, mi) => sum + Number(mi.quantity), 0);
                                return {
                                    name: pm.productVariant.name,
                                    required: Number(pm.quantity),
                                    issued,
                                    unit: pm.productVariant.primaryUnit
                                };
                            });

                            return (
                                <AccordionItem key={order.id} value={order.id} className="border rounded-lg px-4 bg-card shadow-sm">
                                    <AccordionTrigger className="hover:no-underline py-3">
                                        <div className="flex items-center gap-4 w-full pr-4 text-sm">
                                            {/* Status Dot */}
                                            <div className={cn(
                                                "w-2.5 h-2.5 rounded-full flex-shrink-0",
                                                order.status === 'RELEASED' ? "bg-blue-500" : "bg-amber-500"
                                            )} />

                                            {/* Order Number — truncated with tooltip + copy */}
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <span
                                                        className="font-mono font-bold text-foreground cursor-help"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigator.clipboard.writeText(order.orderNumber);
                                                        }}
                                                    >
                                                        {shortOrderId(order.orderNumber)}
                                                    </span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="flex items-center gap-2">
                                                    <span className="font-mono text-xs">{order.orderNumber}</span>
                                                    <Copy className="w-3 h-3 opacity-60" />
                                                </TooltipContent>
                                            </Tooltip>

                                            {/* Product */}
                                            <span className="font-medium text-foreground flex-1 text-left truncate flex items-center gap-2">
                                                {order.bom.productVariant.product.name}
                                                <Badge variant="outline" className="text-[10px] font-normal h-5">
                                                    {order.bom.productVariant.name}
                                                </Badge>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Badge
                                                            variant="outline"
                                                            className={cn(
                                                                'text-[10px] font-bold h-5 shrink-0',
                                                                isRmPath
                                                                    ? 'border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/40'
                                                                    : 'border-sky-300 text-sky-700 bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:bg-sky-950/40',
                                                            )}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            {isRmPath ? warehouseLabels.badgeRm : warehouseLabels.badgeWip}
                                                        </Badge>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="max-w-xs text-xs">
                                                        {isRmPath
                                                            ? warehouseLabels.pathBadgeRmHelp
                                                            : warehouseLabels.pathBadgeWipHelp}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </span>

                                            {/* Machine */}
                                            <div className="hidden sm:flex items-center text-muted-foreground w-32">
                                                <MapPin className="w-3.5 h-3.5 mr-1.5" />
                                                <span className="text-xs truncate">{order.machine?.name || 'Generic'}</span>
                                            </div>

                                            {/* Date */}
                                            <div className="hidden md:flex items-center text-muted-foreground w-32 justify-end">
                                                <Clock className="w-3.5 h-3.5 mr-1.5" />
                                                <span className="text-xs">{format(new Date(order.plannedStartDate), 'MMM d, HH:mm')}</span>
                                            </div>

                                            {/* Progress Mini */}
                                            <div className="w-16 flex justify-end">
                                                <span className={cn(
                                                    "text-xs font-bold",
                                                    isFullyIssued ? "text-emerald-500" : "text-orange-500"
                                                )}>
                                                    {fulfillmentProgress.toFixed(0)}%
                                                </span>
                                            </div>
                                        </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="pt-2 pb-4 border-t mt-2">
                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                            {/* Section 1: Detail & Progress */}
                                            <div className="lg:col-span-1 space-y-4">
                                                <div className="p-3 bg-muted/30 rounded-lg border">
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-end">
                                                            <span className="text-xs font-bold text-muted-foreground uppercase">Material Fulfillment</span>
                                                        </div>
                                                        <Progress value={fulfillmentProgress} className={cn(
                                                            "h-2.5",
                                                            isFullyIssued ? "[&>div]:bg-emerald-500" : "[&>div]:bg-orange-500"
                                                        )} />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="p-3 bg-muted/30 rounded-lg border">
                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Status</span>
                                                        <Badge variant={order.status === 'RELEASED' ? 'default' : 'secondary'}>
                                                            {order.status}
                                                        </Badge>
                                                    </div>
                                                    <div className="p-3 bg-muted/30 rounded-lg border">
                                                        <span className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Priority</span>
                                                        <span className="text-xs font-semibold">Normal</span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                                        {warehouseLabels.warehouseActions}
                                                    </p>
                                                    <BatchIssueMaterialDialog
                                                        order={order}
                                                        locations={formData.locations}
                                                        rawMaterials={formData.rawMaterials}
                                                    />
                                                    {(order.status === 'RELEASED' || order.status === 'IN_PROGRESS') && (
                                                        <AdHocMaterialUsageDialog
                                                            order={order}
                                                            locations={formData.locations}
                                                            rawMaterials={formData.rawMaterials}
                                                        />
                                                    )}
                                                    <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                                                        Print Pick List
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Section 2: Material Requirements Table */}
                                            <div className="lg:col-span-2">
                                                <ResponsiveTable minWidth={500} className="rounded-lg border bg-card overflow-hidden">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-muted/50 border-b">
                                                            <tr>
                                                                <th className="p-2 text-left font-medium text-xs text-muted-foreground uppercase">Material</th>
                                                                <th className="p-2 text-right font-medium text-xs text-muted-foreground uppercase">Required</th>
                                                                <th className="p-2 text-right font-medium text-xs text-muted-foreground uppercase">Issued</th>
                                                                <th className="p-2 text-center w-10"></th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y text-xs sm:text-sm">
                                                            {materialItems.map((item, idx) => (
                                                                <tr key={idx} className="hover:bg-muted/30">
                                                                    <td className="p-2 font-medium">{item.name}</td>
                                                                    <td className="p-2 text-right text-muted-foreground">{item.required} {item.unit}</td>
                                                                    <td className="p-2 text-right">
                                                                        <span className={cn(
                                                                            "font-bold",
                                                                            item.issued >= item.required ? "text-emerald-600" : "text-orange-600"
                                                                        )}>
                                                                            {item.issued}
                                                                        </span>
                                                                    </td>
                                                                    <td className="p-2 text-center">
                                                                        {item.issued >= item.required && (
                                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </ResponsiveTable>
                                            </div>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>

                    {filteredOrders.length === 0 && (
                        <Card className="border-dashed bg-transparent mt-4">
                            <CardContent className="py-20 text-center">
                                <p className="text-muted-foreground italic">No active production orders.</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </CardContent>
        </Card>

        <ConsolidatedIssueDialog
            isOpen={isConsolDialogOpen}
            onClose={() => setIsConsolDialogOpen(false)}
            orders={filteredOrders}
            locations={formData.locations}
        />
        </>
    );
}
