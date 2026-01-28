'use client';

import { useState, useEffect } from 'react';
import { ExtendedProductionOrder } from '@/components/production/order-detail/types';
import { Input } from '@/components/ui/input';
import { Search, Clock, MapPin, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslations } from 'next-intl';
import { Location, Employee as PrismaEmployee, ProductVariant, Machine, WorkShift } from '@prisma/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { format } from 'date-fns';
import { BatchIssueMaterialDialog } from '@/components/production/order-detail/BatchIssueMaterialDialog';

interface WarehouseRefreshWrapperProps {
    initialOrders: ExtendedProductionOrder[];
    refreshData: () => Promise<void>;
    formData: {
        locations: Location[];
        operators: PrismaEmployee[];
        helpers: PrismaEmployee[];
        workShifts: WorkShift[];
        machines: Machine[];
        rawMaterials: ProductVariant[];
    };
    sessionUser?: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
        role?: string;
    };
}

export default function WarehouseRefreshWrapper({
    initialOrders,
    refreshData,
    formData,
    sessionUser
}: WarehouseRefreshWrapperProps) {
    const t = useTranslations('warehouse');
    const [searchQuery, setSearchQuery] = useState('');

    // Auto-refresh logic (every 30 seconds)
    useEffect(() => {
        const interval = setInterval(() => {
            refreshData();
        }, 30000);
        return () => clearInterval(interval);
    }, [refreshData]);

    const filteredOrders = initialOrders.filter(order => {
        const matchesSearch =
            order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            order.bom.productVariant.product.name.toLowerCase().includes(searchQuery.toLowerCase());

        // We only show orders that have RELEASED or IN_PROGRESS status
        // And potentially filter out those that are "Material Complete" if we want
        return matchesSearch;
    });

    // --- Main Content UI ---
    return (
        <div className="flex-1 flex flex-col min-h-0 bg-background/50">
            {/* Action Bar */}
            <div className="bg-card border-b px-4 py-3 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
                <div className="relative w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder={t('searchPlaceholder')}
                        className="pl-10 h-10 shadow-inner bg-muted/50 border-none"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                    <div className="flex items-center gap-3 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20">
                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                            {sessionUser?.name?.charAt(0) || 'U'}
                        </div>
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{sessionUser?.name || 'User'}</span>
                    </div>
                </div>
            </div>

            {/* Orders Feed */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                            <span className="w-2 h-4 bg-orange-500 rounded-full" />
                            {t('releasedOrdersQueue')}
                        </h2>
                        <span className="text-xs font-medium text-muted-foreground/60">{t('ordersFound', { count: filteredOrders.length })}</span>
                    </div>

                    <Accordion type="single" collapsible className="w-full space-y-2">
                        {filteredOrders.map(order => {
                            const plannedMaterials = order.plannedMaterials || [];
                            const materialIssues = order.materialIssues || [];

                            // Calculate overall fulfillment progress
                            const totalRequired = plannedMaterials.reduce((sum, pm) => sum + Number(pm.quantity), 0);
                            const totalIssued = materialIssues.reduce((sum, mi) => sum + Number(mi.quantity), 0);
                            const fulfillmentProgress = totalRequired > 0 ? (totalIssued / totalRequired) * 100 : 0;
                            const isFullyIssued = fulfillmentProgress >= 99.9;

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
                                <AccordionItem key={order.id} value={order.id} className="border rounded-lg px-4 bg-card shadow-sm">
                                    <AccordionTrigger className="hover:no-underline py-3">
                                        <div className="flex items-center gap-4 w-full pr-4 text-sm">
                                            {/* Status Dot */}
                                            <div className={cn(
                                                "w-2.5 h-2.5 rounded-full flex-shrink-0",
                                                order.status === 'RELEASED' ? "bg-blue-500" : "bg-amber-500"
                                            )} />

                                            {/* Order Number */}
                                            <span className="font-mono font-bold text-foreground w-20">{order.orderNumber}</span>

                                            {/* Product */}
                                            <span className="font-medium text-foreground flex-1 text-left truncate flex items-center gap-2">
                                                {order.bom.productVariant.product.name}
                                                <Badge variant="outline" className="text-[10px] font-normal h-5">
                                                    {order.bom.productVariant.name}
                                                </Badge>
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
                                                    <BatchIssueMaterialDialog
                                                        order={order}
                                                        locations={formData.locations}
                                                        rawMaterials={formData.rawMaterials}
                                                    />
                                                    <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                                                        Print Pick List
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Section 2: Material Requirements Table */}
                                            <div className="lg:col-span-2">
                                                <div className="rounded-lg border bg-card overflow-hidden">
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
                                                </div>
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
                                <p className="text-slate-400 italic">{t('noOrders')}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
