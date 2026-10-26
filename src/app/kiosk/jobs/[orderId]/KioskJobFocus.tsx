'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowLeft,
    Loader2,
    PackagePlus,
    Play,
    Plus,
    Square,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    pickRekapShift,
    summarizeShiftOutput,
} from '@/lib/production/kiosk-shift-status';
import { useVerifiedKioskOperator } from '@/components/kiosk/useVerifiedKioskOperator';
import { useKioskPackagingContext } from '@/components/production/kiosk/useKioskPackagingContext';
import { KioskPackagingPanel } from '@/components/production/kiosk/KioskPackagingPanel';
import { startExecution } from '@/actions/production/production';
import { KioskStopDialog } from '@/components/production/kiosk/KioskStopDialog';
import { DowntimeDialog } from '@/components/production/kiosk/DowntimeDialog';
import { KioskLogOutputDialog } from '@/components/production/kiosk/KioskLogOutputDialog';
import {
    KioskOutputHistory,
    type KioskOutputHistoryLog,
} from '@/components/production/kiosk/KioskOutputHistory';
import {
    AdditionalMaterialRequestDialog,
    type KioskMaterialOption,
} from '@/components/production/kiosk/AdditionalMaterialRequestDialog';
import { KioskJobProgress } from '@/components/kiosk/KioskJobProgress';
import { KioskPill } from '@/components/kiosk/ui/KioskPill';
import { kioskButton } from '@/components/kiosk/ui/kiosk-button';
import {
    getProductionUnitMeta,
    toDisplayQuantity,
} from '@/lib/utils/production-units';
import { kioskLabels } from '@/lib/labels';
import { getStatusLabel } from '@/lib/labels/helpers';
import { legacyScrapSummary } from '@/lib/production/quantity-summary';
import { cn } from '@/lib/utils/utils';
import {
    resolveKioskMode,
    type ProductionExecutionMode,
} from '@/lib/production/rewinder-workflow';

export interface Order {
    id: string;
    orderNumber: string;
    plannedQuantity: number;
    plannedEnteredQuantity?: number | null;
    plannedEnteredUnit?: string | null;
    plannedConversionFactorSnapshot?: number | null;
    actualQuantity: number | null;
    /** Output and packaging are recorded together (etiket, karung, plastik). */
    actualPackagingEnabled?: boolean;
    status: string;
    executionModeSnapshot?: string | null;
    processCodeSnapshot?: string | null;
    processNameSnapshot?: string | null;
    bom: {
        outputQuantity?: unknown;
        productVariantId: string;
        productVariant: {
            name: string;
            skuCode: string;
            primaryUnit?: string | null;
            salesUnit?: string | null;
            conversionFactor?: unknown;
        };
        items?: Array<{
            id: string;
            quantity: number;
            productVariant: {
                id: string;
                name: string;
                skuCode: string;
                primaryUnit?: string | null;
            };
        }>;
    };
    machine?: {
        id: string;
        name: string;
    } | null;
    executions: Array<{
        id: string;
        startTime: Date;
        endTime: Date | null;
        createdAt?: string;
        status?: string;
        quantityProduced?: number | null;
        enteredQuantity?: number | null;
        scrapQuantity?: number | null;
        scrapDaunQty?: number | null;
        scrapProngkolQty?: number | null;
        enteredUnit?: string | null;
        operatorId?: string | null;
        shiftId?: string | null;
        operator?: { name: string } | null;
        shift?: { shiftName: string } | null;
    }>;
    outputLogs?: KioskOutputHistoryLog[];
    helpers?: Array<{
        id: string;
        name: string;
    }>;
}

export interface Shift {
    id: string;
    shiftName: string;
    startTime: Date | string;
    endTime: Date | string;
    operatorId: string | null;
}

interface KioskJobFocusProps {
    order: Order;
    shifts?: Shift[];
    materials?: KioskMaterialOption[];
}

const REFRESH_SECONDS = 30;
const TIME = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
});
const qty = (value: number, unit: string) =>
    `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ${unit}`;

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="grid gap-1 rounded-xl bg-muted/60 p-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-lg font-bold tabular-nums">{value}</dd>
        </div>
    );
}

export default function KioskJobFocus({
    order,
    shifts = [],
    materials = [],
}: KioskJobFocusProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [stopDialogOpen, setStopDialogOpen] = useState(false);
    const [logDialogOpen, setLogDialogOpen] = useState(false);
    const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
    const [downtimeDialogOpen, setDowntimeDialogOpen] = useState(false);
    const operator = useVerifiedKioskOperator();
    const operatorId = operator.operatorId;
    const isInitialized = operator.isReady;
    const usesActualPackaging = Boolean(order.actualPackagingEnabled);
    const packaging = useKioskPackagingContext(
        order.id,
        usesActualPackaging && Boolean(operatorId),
    );
    const [timeLeft, setTimeLeft] = useState(REFRESH_SECONDS);
    const [optimisticExecutionId, setOptimisticExecutionId] = useState<
        string | null
    >(null);
    const [, startTransition] = useTransition();

    const activeExecution =
        order.executions.find((e) => !e.endTime) ??
        (optimisticExecutionId
            ? {
                  id: optimisticExecutionId,
                  startTime: new Date(),
                  endTime: null,
              }
            : undefined);
    const isRunning = !!activeExecution;
    const unitMeta = getProductionUnitMeta(order.bom.productVariant);

    const mode: ProductionExecutionMode = resolveKioskMode(
        order.executionModeSnapshot,
    );
    const processName = order.processNameSnapshot || null;

    // Gate: back to the hub when no operator holds a valid PIN session
    useEffect(() => {
        if (isInitialized && !operatorId) {
            if (operator.expired) toast.error(kioskLabels.sessionExpired);
            router.push('/kiosk');
        }
    }, [isInitialized, operatorId, operator.expired, router]);

    // Clear optimistic override once real execution lands via router.refresh()
    useEffect(() => {
        const realActive = order.executions.find((e) => !e.endTime);
        if (realActive && optimisticExecutionId) {
            setOptimisticExecutionId(null);
        }
    }, [order.executions, optimisticExecutionId]);

    // Auto-refresh (30s), paused while a dialog is open so input is never lost
    const dialogOpen =
        logDialogOpen ||
        stopDialogOpen ||
        materialDialogOpen ||
        downtimeDialogOpen;
    useEffect(() => {
        if (dialogOpen) return;
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev <= 0 ? REFRESH_SECONDS : prev - 1));
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
                toast.success(
                    activeExecution ? 'Operator diganti!' : 'Produksi dimulai!',
                );
                const startedId =
                    (result.data as { id?: string } | null | undefined)?.id ??
                    null;
                if (startedId) setOptimisticExecutionId(startedId);
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal memulai produksi');
            }
        } catch {
            toast.error('Gagal memproses. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Rekap shift: aggregate completed executions of the selected shift ──
    // Pure helper (kiosk-shift-status.ts) mempertahankan logika pilihan lama
    // dan menambah flag `stale` = tidak ada shift aktif (semua window lewat).
    const rekapShift = pickRekapShift(shifts, Date.now(), operatorId);
    const selectedShift = rekapShift.shift;
    const isShiftStale = rekapShift.stale;

    const { myTotal: myShiftTotal, orderTotal: orderShiftTotal } =
        summarizeShiftOutput(
            order.executions || [],
            selectedShift?.id,
            operatorId,
            unitMeta,
        );

    // Progress numbers must match displayUnit (convert base → sales when alternate unit)
    const actualBase = order.actualQuantity || 0;
    const targetBase = order.plannedQuantity;
    const progressActual = unitMeta.hasAlternateUnit
        ? toDisplayQuantity(actualBase, unitMeta.conversionFactor)
        : actualBase;
    const progressTarget = unitMeta.hasAlternateUnit
        ? toDisplayQuantity(targetBase, unitMeta.conversionFactor)
        : targetBase;
    const remaining = Math.max(progressTarget - progressActual, 0);

    // Generic scrapQuantity is an aggregate duplicate on kiosk-written rows;
    // AddOutputDialog rows leave it 0 and use the dedicated affal columns.
    // executionScrapTotal = max(generic, prongkol + daun) is exact for both.
    const scrapSummary = legacyScrapSummary(
        (order.executions || []).filter((e) => e.status !== 'VOIDED'),
        unitMeta.primaryUnit,
    );

    if (!isInitialized || !operatorId) {
        return (
            <div
                role="status"
                className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-lg text-muted-foreground"
            >
                <Loader2 aria-hidden="true" className="size-8 animate-spin" />
                {kioskLabels.loadingKiosk}
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                    href="/kiosk/jobs"
                    className={kioskButton({ tone: 'ghost' })}
                >
                    <ArrowLeft aria-hidden="true" /> {kioskLabels.focusBack}
                </Link>
                <span className="flex flex-wrap items-center gap-2">
                    {isRunning ? (
                        <KioskPill tone="go" live>
                            {kioskLabels.running} · {kioskLabels.focusSince}{' '}
                            {TIME.format(new Date(activeExecution.startTime))}
                        </KioskPill>
                    ) : (
                        <KioskPill tone="info">
                            {getStatusLabel(order.status, 'production')}
                        </KioskPill>
                    )}
                    <span className="font-mono text-base text-muted-foreground">
                        {order.orderNumber}
                    </span>
                </span>
            </div>

            <div
                className={cn(
                    'grid gap-4',
                    usesActualPackaging &&
                        'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]',
                )}
            >
                <div className="grid min-w-0 content-start gap-4">
                    <section
                        className={cn(
                            'grid gap-4 rounded-2xl border-2 bg-card p-5',
                            isRunning ? 'border-kiosk-go' : 'border-border',
                        )}
                    >
                        <div>
                            <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
                                {order.bom.productVariant.name}
                            </h1>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {processName && (
                                    <KioskPill>{processName}</KioskPill>
                                )}
                                {mode === 'INDIVIDUAL_OUTPUT' && (
                                    <KioskPill>
                                        {kioskLabels.modeIndividual}
                                    </KioskPill>
                                )}
                                {mode === 'MATERIAL_CONVERSION' && (
                                    <KioskPill>
                                        {kioskLabels.modeMaterial}
                                    </KioskPill>
                                )}
                                {order.machine && (
                                    <KioskPill>{order.machine.name}</KioskPill>
                                )}
                                <KioskPill>{operator.operatorName}</KioskPill>
                                {selectedShift && (
                                    <KioskPill>
                                        {selectedShift.shiftName}
                                    </KioskPill>
                                )}
                            </div>
                        </div>

                        <KioskJobProgress
                            actual={progressActual}
                            target={progressTarget}
                            unit={`${unitMeta.displayUnit} · ${kioskLabels.focusRemaining} ${qty(remaining, unitMeta.displayUnit)}`}
                        />

                        {isShiftStale && (
                            <p className="flex items-start gap-2 rounded-xl bg-kiosk-warn-soft p-3 text-base text-kiosk-warn-ink">
                                <AlertTriangle
                                    aria-hidden="true"
                                    className="mt-0.5 size-5 shrink-0"
                                />
                                {kioskLabels.focusStaleShift}
                            </p>
                        )}

                        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Stat
                                label={kioskLabels.historyScrap}
                                value={scrapSummary}
                            />
                            {selectedShift && (
                                <>
                                    <Stat
                                        label={kioskLabels.focusMyShift}
                                        value={qty(
                                            myShiftTotal,
                                            unitMeta.displayUnit,
                                        )}
                                    />
                                    <Stat
                                        label={kioskLabels.focusShiftTotal}
                                        value={qty(
                                            orderShiftTotal,
                                            unitMeta.displayUnit,
                                        )}
                                    />
                                </>
                            )}
                        </dl>
                    </section>

                    {isRunning ? (
                        <>
                            <button
                                type="button"
                                className={kioskButton({
                                    size: 'xl',
                                    tone: 'go',
                                })}
                                onClick={() => setLogDialogOpen(true)}
                                disabled={isLoading}
                            >
                                <Plus aria-hidden="true" />
                                {kioskLabels.logOutput}
                            </button>
                            <div className="grid gap-2 sm:grid-cols-3">
                                <button
                                    type="button"
                                    className={kioskButton()}
                                    onClick={() => setMaterialDialogOpen(true)}
                                >
                                    <PackagePlus aria-hidden="true" />
                                    {kioskLabels.focusMaterial}
                                </button>
                                {order.machine && (
                                    <button
                                        type="button"
                                        className={kioskButton()}
                                        onClick={() =>
                                            setDowntimeDialogOpen(true)
                                        }
                                    >
                                        <AlertTriangle aria-hidden="true" />
                                        {kioskLabels.focusDowntime}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={kioskButton({ tone: 'stop' })}
                                    onClick={() => setStopDialogOpen(true)}
                                    disabled={isLoading}
                                >
                                    <Square aria-hidden="true" />
                                    {kioskLabels.focusStop}
                                </button>
                            </div>
                        </>
                    ) : (
                        <button
                            type="button"
                            className={kioskButton({ size: 'xl', tone: 'go' })}
                            onClick={handleStart}
                            disabled={isLoading || order.status === 'COMPLETED'}
                        >
                            {isLoading ? (
                                <Loader2
                                    aria-hidden="true"
                                    className="animate-spin"
                                />
                            ) : (
                                <Play aria-hidden="true" />
                            )}
                            {kioskLabels.startJob}
                        </button>
                    )}
                </div>

                {usesActualPackaging && (
                    <KioskPackagingPanel
                        context={packaging.context}
                        isLoading={packaging.isLoading}
                        error={packaging.error}
                        onRetry={packaging.reload}
                        remainingBaseQty={Math.max(
                            order.plannedQuantity - (order.actualQuantity || 0),
                            0,
                        )}
                    />
                )}
            </div>

            <KioskOutputHistory
                logs={order.outputLogs ?? []}
                primaryUnit={unitMeta.primaryUnit}
            />

            {/* Dialogs */}
            {activeExecution && (
                <>
                    <AdditionalMaterialRequestDialog
                        productionOrderId={order.id}
                        orderNumber={order.orderNumber}
                        operatorId={operatorId}
                        materials={materials}
                        open={materialDialogOpen}
                        onOpenChange={setMaterialDialogOpen}
                        onSuccess={() => router.refresh()}
                    />
                    {order.machine && (
                        <DowntimeDialog
                            machineId={order.machine.id}
                            machineName={order.machine.name}
                            operatorId={operatorId}
                            open={downtimeDialogOpen}
                            onOpenChange={setDowntimeDialogOpen}
                        />
                    )}
                    <KioskStopDialog
                        open={stopDialogOpen}
                        onOpenChange={setStopDialogOpen}
                        executionId={activeExecution.id}
                        orderNumber={order.orderNumber}
                        progressLabel={`${qty(progressActual, unitMeta.displayUnit)} dari ${qty(progressTarget, unitMeta.displayUnit)}`}
                        remainingLabel={
                            remaining > 0
                                ? qty(remaining, unitMeta.displayUnit)
                                : null
                        }
                        operatorId={operatorId || undefined}
                        onRecordOutput={() => setLogDialogOpen(true)}
                        onSuccess={() => router.refresh()}
                    />
                    <KioskLogOutputDialog
                        open={logDialogOpen}
                        onOpenChange={setLogDialogOpen}
                        executionId={activeExecution.id}
                        productVariantId={order.bom.productVariantId}
                        productName={order.bom.productVariant.name}
                        primaryUnit={unitMeta.primaryUnit}
                        salesUnit={unitMeta.salesUnit}
                        conversionFactor={unitMeta.conversionFactor}
                        operatorId={operatorId || undefined}
                        operatorName={operator.operatorName ?? undefined}
                        orderHelpers={order.helpers}
                        shifts={shifts}
                        executionModeSnapshot={
                            order.executionModeSnapshot ?? null
                        }
                        processNameSnapshot={order.processNameSnapshot ?? null}
                        bomOutputQuantity={order.bom.outputQuantity}
                        bomItems={order.bom.items || []}
                        actualPackagingEnabled={usesActualPackaging}
                        packaging={{
                            context: packaging.context,
                            isLoading: packaging.isLoading,
                            error: packaging.error,
                            onRetry: packaging.reload,
                        }}
                        onSuccess={() => {
                            packaging.reload();
                            router.refresh();
                        }}
                    />
                </>
            )}
        </div>
    );
}
