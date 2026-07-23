'use client';

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Square, AlertTriangle, PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { startExecution } from "@/actions/production/production";
import { KioskStopDialog } from "@/components/production/kiosk/KioskStopDialog";
import { DowntimeDialog } from "@/components/production/kiosk/DowntimeDialog";
import { KioskLogOutputDialog } from "@/components/production/kiosk/KioskLogOutputDialog";
import { KioskJobProgress } from "@/components/kiosk/KioskJobProgress";
import { getProductionUnitMeta, toDisplayQuantity } from "@/lib/utils/production-units";
import { kioskLabels } from "@/lib/labels";
import { getStatusLabel } from "@/lib/labels/helpers";

export interface Order {
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

interface KioskJobFocusProps {
    order: Order;
}

export default function KioskJobFocus({ order }: KioskJobFocusProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [stopDialogOpen, setStopDialogOpen] = useState(false);
    const [logDialogOpen, setLogDialogOpen] = useState(false);
    const [operatorId, setOperatorId] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const [timeLeft, setTimeLeft] = useState(30);
    const [_isPending, startTransition] = useTransition();

    const activeExecution = order.executions.find(e => !e.endTime);
    const isRunning = !!activeExecution;
    const unitMeta = getProductionUnitMeta(order.bom.productVariant);

    // Hydrate operator from sessionStorage
    useEffect(() => {
        const saved = sessionStorage.getItem('kiosk_operator_id');
        setOperatorId(saved);
        setIsInitialized(true);
    }, []);

    // Gate: redirect to hub if no operator selected
    useEffect(() => {
        if (isInitialized && !operatorId) {
            router.push('/kiosk');
        }
    }, [isInitialized, operatorId, router]);

    // Auto-refresh timer (30s) — pause while log/stop dialog open
    const dialogOpen = logDialogOpen || stopDialogOpen;
    useEffect(() => {
        if (dialogOpen) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 0) return 30;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [dialogOpen]);

    useEffect(() => {
        if (dialogOpen) return;
        if (timeLeft === 0) {
            startTransition(() => {
                router.refresh();
            });
        }
    }, [timeLeft, router, dialogOpen]);

    const handleStart = async () => {
        setIsLoading(true);
        try {
            const result = await startExecution({
                productionOrderId: order.id,
                machineId: order.machine?.id,
                operatorId: operatorId || undefined,
            });

            if (result.success) {
                toast.success(activeExecution ? "Operator diganti!" : "Produksi dimulai!");
                router.refresh();
            } else {
                toast.error(result.error || "Gagal memulai produksi");
            }
        } catch {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    const recentLogs = (order.outputLogs || []).slice(0, 3);

    // Progress numbers must match displayUnit (convert base → sales when alternate unit)
    const actualBase = order.actualQuantity || 0;
    const targetBase = order.plannedQuantity;
    const progressActual = unitMeta.hasAlternateUnit
        ? toDisplayQuantity(actualBase, unitMeta.conversionFactor)
        : actualBase;
    const progressTarget = unitMeta.hasAlternateUnit
        ? toDisplayQuantity(targetBase, unitMeta.conversionFactor)
        : targetBase;

    // Show loading while hydrating or redirecting to hub (no operator)
    if (!isInitialized || !operatorId) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Auto-refresh timer */}
            <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full">
                <div
                    className="h-full bg-primary transition-all duration-1000 ease-linear"
                    style={{ width: `${(timeLeft / 30) * 100}%` }}
                />
            </div>

            {/* Back nav */}
            <div className="flex items-center gap-3">
                <Link href="/kiosk/jobs">
                    <Button variant="ghost" size="icon" className="h-10 w-10" title={kioskLabels.focusBack}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground font-mono">WO#{order.orderNumber}</span>
                        <Badge
                            variant={isRunning ? "default" : "secondary"}
                            className={`${isRunning ? "bg-emerald-600 animate-pulse" : ""} text-[10px]`}
                        >
                            {isRunning ? kioskLabels.running.toUpperCase() : getStatusLabel(order.status, 'production')}
                        </Badge>
                    </div>
                </div>
            </div>

            {/* Job info card */}
            <div className={`bg-card border-2 rounded-2xl p-6 md:p-8 ${isRunning ? 'border-emerald-500 shadow-lg' : 'border-border'}`}>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight leading-tight mb-2">
                    {order.bom.productVariant.name}
                </h1>

                <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-6">
                    {order.machine && (
                        <span className="flex items-center gap-1">
                            <span className="font-semibold">{kioskLabels.machine}:</span> {order.machine.name}
                        </span>
                    )}
                    <span className="flex items-center gap-1">
                        <span className="font-semibold">{kioskLabels.operator}:</span> {operatorId ? 'Anda' : '-'}
                    </span>
                </div>

                {/* Progress — numbers in display unit (e.g. BAL), not base KG */}
                <KioskJobProgress
                    actual={progressActual}
                    target={progressTarget}
                    unit={unitMeta.displayUnit}
                />
            </div>

            {/* CTA buttons */}
            <div className="space-y-3">
                {isRunning ? (
                    <>
                        <Button
                            className="w-full h-16 text-lg md:text-xl font-black bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg"
                            onClick={() => setLogDialogOpen(true)}
                            disabled={isLoading}
                        >
                            <PlusCircle className="mr-3 h-6 w-6 md:h-7 md:w-7" />
                            {kioskLabels.logOutput.toUpperCase()}
                        </Button>

                        <div className="grid grid-cols-2 gap-3">
                            {order.machine && (
                                <DowntimeDialog
                                    machineId={order.machine.id}
                                    machineName={order.machine.name}
                                    operatorId={operatorId || undefined}
                                    trigger={
                                        <Button
                                            variant="outline"
                                            className="h-14 text-base font-bold border-2 active:scale-95"
                                        >
                                            <AlertTriangle className="mr-2 h-5 w-5" />
                                            {kioskLabels.focusDowntime}
                                        </Button>
                                    }
                                />
                            )}
                            <Button
                                variant="destructive"
                                className="h-14 text-base font-bold active:scale-95"
                                onClick={() => setStopDialogOpen(true)}
                                disabled={isLoading}
                            >
                                <Square className="mr-2 h-5 w-5 fill-current" />
                                {kioskLabels.focusStop}
                            </Button>
                        </div>
                    </>
                ) : (
                    <Button
                        className="w-full h-16 text-lg md:text-xl font-black bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-lg"
                        onClick={handleStart}
                        disabled={isLoading || order.status === 'COMPLETED'}
                    >
                        <Play className="mr-3 h-6 w-6 md:h-7 md:w-7 fill-current" />
                        {kioskLabels.startJob.toUpperCase()}
                    </Button>
                )}
            </div>

            {/* Recent logs */}
            {recentLogs.length > 0 && (
                <div className="bg-muted/30 border rounded-xl p-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        {kioskLabels.focusLogTerakhir}
                    </h3>
                    <div className="space-y-2">
                        {recentLogs.map((log) => (
                            <div key={log.id} className="flex items-center justify-between p-2 bg-background rounded-lg text-sm">
                                <span className="font-bold text-emerald-600">
                                    +{log.quantity.toLocaleString('id-ID')} {unitMeta.primaryUnit}
                                </span>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {new Date(log.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Dialogs */}
            {activeExecution && (
                <>
                    <KioskStopDialog
                        open={stopDialogOpen}
                        onOpenChange={setStopDialogOpen}
                        executionId={activeExecution.id}
                        productName={order.bom.productVariant.name}
                        primaryUnit={unitMeta.primaryUnit}
                        salesUnit={unitMeta.salesUnit}
                        conversionFactor={unitMeta.conversionFactor}
                        currentProduced={order.actualQuantity || 0}
                        targetQuantity={order.plannedQuantity}
                        logs={order.outputLogs || []}
                        operatorId={operatorId || undefined}
                        onSuccess={() => router.refresh()}
                    />
                    <KioskLogOutputDialog
                        open={logDialogOpen}
                        onOpenChange={setLogDialogOpen}
                        executionId={activeExecution.id}
                        productName={order.bom.productVariant.name}
                        primaryUnit={unitMeta.primaryUnit}
                        salesUnit={unitMeta.salesUnit}
                        conversionFactor={unitMeta.conversionFactor}
                        operatorId={operatorId || undefined}
                        orderHelpers={order.helpers}
                        onSuccess={() => router.refresh()}
                    />
                </>
            )}
        </div>
    );
}
