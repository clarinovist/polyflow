'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { startExecution } from "@/actions/production/production";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { formatProductionQuantity, getEnteredQuantityDisplay } from "@/lib/utils/production-units";
import { kioskLabels } from "@/lib/labels";
import { getStatusLabel } from "@/lib/labels/helpers";

interface ProductionOrder {
    id: string;
    orderNumber: string;
    plannedQuantity: number;
    plannedEnteredQuantity?: number | null;
    plannedEnteredUnit?: string | null;
    plannedConversionFactorSnapshot?: number | null;
    actualQuantity: number | null;
    status: string;
    bom: {
        productVariant: {
            name: string;
            skuCode: string;
            primaryUnit?: string | null;
            salesUnit?: string | null;
            conversionFactor?: unknown;
        };
    };
    machine?: {
        id: string;
        name: string;
    } | null;
    executions: Array<{
        id: string;
        startTime: Date;
        endTime: Date | null;
    }>;
    outputLogs?: Array<{
        id: string;
        quantity: number;
        createdAt: string;
    }>;
    helpers?: Array<{
        id: string;
        name: string;
    }>;
}

interface KioskOrderCardProps {
    order: ProductionOrder;
    operatorId?: string;
}

export function KioskOrderCard({ order, operatorId }: KioskOrderCardProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const activeExecution = order.executions.find(e => !e.endTime);
    const isRunning = !!activeExecution;

    const handleStart = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsLoading(true);
        try {
            const result = await startExecution({
                productionOrderId: order.id,
                machineId: order.machine?.id,
                operatorId: operatorId,
            });

            if (result.success) {
                toast.success(activeExecution ? "Operator diganti!" : "Produksi dimulai!");
                // Navigate to focus after start
                router.push(`/kiosk/jobs/${order.id}`);
            } else {
                toast.error(result.error || "Gagal memulai produksi");
            }
        } catch {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCardClick = () => {
        router.push(`/kiosk/jobs/${order.id}`);
    };

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={handleCardClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(); } }}
            className={`flex flex-col rounded-xl border-2 shadow-sm text-left w-full transition-all active:scale-[0.98] hover:shadow-md ${isRunning ? 'border-emerald-500 bg-emerald-50/10 shadow-lg hover:border-emerald-600' : 'border-border bg-card text-card-foreground hover:border-primary/50'} h-full overflow-hidden cursor-pointer`}
        >
            <div className="p-3 md:p-4 pb-2 border-b-0 space-y-2">
                <div className="flex justify-between items-start">
                    <Badge variant={isRunning ? "default" : "secondary"} className={`${isRunning ? "bg-emerald-600 animate-pulse" : ""} text-[10px] md:text-sm`}>
                        {isRunning ? kioskLabels.running.toUpperCase() : getStatusLabel(order.status, 'production')}
                    </Badge>
                    <span className="text-xs text-muted-foreground font-mono">{order.orderNumber}</span>
                </div>
                <div>
                    <h3 className="text-lg md:text-xl font-semibold leading-tight tracking-tight line-clamp-2">
                        {order.bom.productVariant.name}
                    </h3>
                    <div className="text-xs md:text-sm font-medium text-muted-foreground mt-1 uppercase tracking-wider">
                        TARGET: {getEnteredQuantityDisplay({
                            ...order.bom.productVariant,
                            quantity: order.plannedQuantity,
                            enteredQuantity: order.plannedEnteredQuantity,
                            enteredUnit: order.plannedEnteredUnit,
                            conversionFactorSnapshot: order.plannedConversionFactorSnapshot,
                        })}
                    </div>
                </div>
            </div>

            <div className="p-3 md:p-4 pt-2 flex-1">
                <div className="grid grid-cols-1 gap-2 text-sm mt-1 md:mt-2">
                    <div className="bg-muted/30 p-2.5 md:p-3 rounded-md flex flex-col gap-1 md:gap-2">
                        <div className="flex justify-between items-start">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{kioskLabels.machine.toUpperCase()}</span>
                                <span className="font-bold text-sm md:text-base">{order.machine?.name || kioskLabels.unassigned}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/30 p-2.5 md:p-3 rounded-md">
                            <span className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{kioskLabels.produced.toUpperCase()}</span>
                            <span className="font-bold text-lg md:text-xl">{formatProductionQuantity(order.actualQuantity || 0, order.bom.productVariant, { showBaseWhenAlternate: false })}</span>
                        </div>
                        <div className="bg-muted/30 p-2.5 md:p-3 rounded-md">
                            <span className="block text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{kioskLabels.target.toUpperCase()}</span>
                            <span className="font-bold text-lg md:text-xl text-muted-foreground">
                                {getEnteredQuantityDisplay({
                                    ...order.bom.productVariant,
                                    quantity: order.plannedQuantity,
                                    enteredQuantity: order.plannedEnteredQuantity,
                                    enteredUnit: order.plannedEnteredUnit,
                                    conversionFactorSnapshot: order.plannedConversionFactorSnapshot,
                                }, { showBaseWhenAlternate: false })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-3 md:p-4 pt-0">
                {!isRunning ? (
                    <Button
                        variant="default"
                        className="w-full h-12 md:h-14 text-sm md:text-lg font-bold bg-emerald-600 hover:bg-emerald-700 shadow-sm active:scale-95"
                        onClick={handleStart}
                        disabled={isLoading || order.status === 'COMPLETED'}
                    >
                        <Play className="mr-2 h-5 w-5 md:h-6 md:w-6 fill-current" /> {kioskLabels.startJob.toUpperCase()}
                    </Button>
                ) : (
                    <div className="text-center py-2 text-sm font-bold text-emerald-700 uppercase tracking-wider">
                        Ketuk untuk buka →
                    </div>
                )}
            </div>
        </div>
    );
}
