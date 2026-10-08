import type { DeliveryOrderDetailData } from './types';
import { Check, Circle, Package, Truck } from 'lucide-react';
import { getDeliveryStatusLabel } from '@/lib/sales/delivery-status';

interface DeliveryProgressTimelineProps {
    order: DeliveryOrderDetailData;
    statusSteps: { status: string; label: string }[];
    currentStatusIndex: number;
}

export function DeliveryProgressTimeline({
    order,
    statusSteps,
    currentStatusIndex,
}: DeliveryProgressTimelineProps) {
    const isTerminalException = ['RETURNED', 'CANCELLED'].includes(order.status);
    const activeIndex = isTerminalException ? -1 : currentStatusIndex;
    const nextStep = activeIndex >= 0 ? statusSteps[activeIndex + 1] : null;

    return (
        <section
            aria-labelledby="delivery-progress-title"
            className="rounded-xl border bg-card p-5 shadow-sm"
        >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                    <h2 id="delivery-progress-title" className="font-semibold">
                        Proses Pengiriman
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {isTerminalException
                            ? 'Proses ditutup dengan status ' +
                              getDeliveryStatusLabel(order.status) +
                              '.'
                            : nextStep
                              ? 'Tahap berikutnya: ' + nextStep.label
                              : 'Seluruh tahap pengiriman selesai.'}
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium">
                    {order.status === 'LOADING' ? (
                        <Package className="h-4 w-4" />
                    ) : (
                        <Truck className="h-4 w-4" />
                    )}
                    {getDeliveryStatusLabel(order.status)}
                </div>
            </div>

            {isTerminalException ? (
                <div className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Tahap sebelumnya tersedia pada tab Audit Status.
                </div>
            ) : (
                <ol className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {statusSteps.map((step, index) => {
                    const isComplete = activeIndex >= 0 && index < activeIndex;
                    const isCurrent = activeIndex === index;
                    const stateLabel = isComplete
                        ? 'Selesai'
                        : isCurrent
                          ? 'Aktif'
                          : 'Menunggu';
                    return (
                        <li
                            key={step.status}
                            aria-current={isCurrent ? 'step' : undefined}
                            className={
                                'relative rounded-lg border p-3 ' +
                                (isCurrent
                                    ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                                    : isComplete
                                      ? 'border-emerald-500/40 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                                      : 'bg-muted/20')
                            }
                        >
                            <div className="flex items-center gap-2">
                                {isComplete ? (
                                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                    <Circle
                                        className={
                                            'h-4 w-4 ' +
                                            (isCurrent
                                                ? 'fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400'
                                                : 'text-muted-foreground')
                                        }
                                    />
                                )}
                                <span className="text-xs font-medium text-muted-foreground">
                                    {stateLabel}
                                </span>
                            </div>
                            <p className="mt-2 text-sm font-semibold">
                                {step.label}
                            </p>
                            {(isComplete || isCurrent) && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Status tercapai:{' '}
                                    {getDeliveryStatusLabel(step.status)}
                                </p>
                            )}
                        </li>
                    );
                })}
                </ol>
            )}
        </section>
    );
}
