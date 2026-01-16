'use client';

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Square, Clock, AlertCircle, AlertTriangle, PlusCircle } from "lucide-react";
import { format } from "date-fns";
import { startExecution, stopExecution } from "@/actions/production";
import { toast } from "sonner";
import { useState } from "react";
import { StartExecutionValues } from "@/lib/zod-schemas";
import { useRouter } from "next/navigation";

import { KioskStopDialog } from "./KioskStopDialog";
import { DowntimeDialog } from "./DowntimeDialog";
import { KioskLogOutputDialog } from "./KioskLogOutputDialog";

interface ProductionOrder {
    id: string;
    orderNumber: string;
    plannedQuantity: number;
    actualQuantity: number | null;
    status: string;
    bom: {
        productVariant: {
            name: string;
            skuCode: string;
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
}

interface KioskOrderCardProps {
    order: ProductionOrder;
    operatorId?: string; // To be passed from context or selection
}

export function KioskOrderCard({ order, operatorId }: KioskOrderCardProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [stopDialogOpen, setStopDialogOpen] = useState(false);
    const [logDialogOpen, setLogDialogOpen] = useState(false);

    // Check if currently running
    const activeExecution = order.executions.find(e => !e.endTime);
    const isRunning = !!activeExecution;

    const handleStart = async () => {
        if (!activeExecution) {
            setIsLoading(true);
            try {
                // Determine shift automatically or prompt? For now simplified.
                const result = await startExecution({
                    productionOrderId: order.id,
                    machineId: order.machine?.id,
                    operatorId: operatorId,
                });

                if (result.success) {
                    toast.success("Production started!");
                    router.refresh();
                } else {
                    toast.error(result.error || "Failed to start");
                }
            } catch (error) {
                toast.error("System error");
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleStop = () => {
        if (activeExecution) {
            setStopDialogOpen(true);
        }
    };

    const handleLogOutput = () => {
        if (activeExecution) {
            setLogDialogOpen(true);
        }
    };

    return (
        <>
            <div className={`flex flex-col rounded-xl border-2 shadow-sm ${isRunning ? 'border-emerald-500 bg-emerald-50/10 shadow-lg' : 'border-border bg-card text-card-foreground'} h-full overflow-hidden`}>
                <div className="p-4 pb-2 border-b-0 space-y-2">
                    <div className="flex justify-between items-start">
                        <Badge variant={isRunning ? "default" : "secondary"} className={isRunning ? "bg-emerald-600 animate-pulse" : ""}>
                            {isRunning ? "RUNNING" : order.status}
                        </Badge>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{order.orderNumber}</span>
                            {order.machine && (
                                <DowntimeDialog
                                    machineId={order.machine.id}
                                    machineName={order.machine.name}
                                    trigger={
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-amber-500 hover:text-amber-600 hover:bg-amber-100/50">
                                            <AlertTriangle className="h-4 w-4" />
                                        </Button>
                                    }
                                />
                            )}
                        </div>
                    </div>
                    <div>
                        <h3 className="text-xl font-semibold leading-none tracking-tight line-clamp-2">
                            {order.bom.productVariant.name}
                        </h3>
                        <div className="text-sm font-medium text-muted-foreground mt-1">
                            TARGET: {order.plannedQuantity}
                        </div>
                    </div>
                </div>

                <div className="p-4 pt-2 flex-1">
                    <div className="grid grid-cols-1 gap-2 text-sm mt-2">
                        <div className="bg-muted/30 p-3 rounded-md flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Machine</span>
                                    <span className="font-bold text-base">{order.machine?.name || "Unassigned"}</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-muted/30 p-3 rounded-md">
                                <span className="block text-xs text-muted-foreground uppercase tracking-wider font-semibold">Produced</span>
                                <span className="font-bold text-xl">{order.actualQuantity || 0}</span>
                            </div>
                            <div className="bg-muted/30 p-3 rounded-md">
                                <span className="block text-xs text-muted-foreground uppercase tracking-wider font-semibold">Target</span>
                                <span className="font-bold text-xl text-muted-foreground">{order.plannedQuantity}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-4 pt-0 flex flex-row items-center gap-2">
                    {isRunning ? (
                        <>
                            <Button
                                variant="outline"
                                className="flex-1 h-12 text-sm font-bold border-emerald-600 text-emerald-700 hover:bg-emerald-50 shadow-sm"
                                onClick={handleLogOutput}
                                disabled={isLoading}
                            >
                                <PlusCircle className="mr-2 h-5 w-5" /> LOG OUTPUT
                            </Button>
                            <Button
                                variant="destructive"
                                size="icon"
                                className="h-12 w-12 shrink-0 shadow-sm"
                                onClick={handleStop}
                                disabled={isLoading}
                                title="Stop Job"
                            >
                                <Square className="h-5 w-5 fill-current" />
                            </Button>
                        </>
                    ) : (
                        <Button
                            variant="default"
                            className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                            onClick={handleStart}
                            disabled={isLoading || order.status === 'COMPLETED'}
                        >
                            <Play className="mr-2 h-5 w-5 fill-current" /> START JOB
                        </Button>
                    )}
                </div>
            </div>

            {activeExecution && (
                <>
                    <KioskStopDialog
                        open={stopDialogOpen}
                        onOpenChange={setStopDialogOpen}
                        executionId={activeExecution.id}
                        productName={order.bom.productVariant.name}
                        currentProduced={order.actualQuantity || 0}
                        targetQuantity={order.plannedQuantity}
                        logs={order.outputLogs || []}
                        onSuccess={() => {
                            router.refresh();
                        }}
                    />
                    <KioskLogOutputDialog
                        open={logDialogOpen}
                        onOpenChange={setLogDialogOpen}
                        executionId={activeExecution.id}
                        productName={order.bom.productVariant.name}
                        onSuccess={() => {
                            router.refresh();
                        }}
                    />
                </>
            )}
        </>
    );
}
