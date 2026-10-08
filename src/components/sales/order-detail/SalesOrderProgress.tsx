import { Check, Circle } from 'lucide-react';
import type { SerializedSalesOrder } from '../sales-order-types';

interface SalesOrderProgressProps {
    order: SerializedSalesOrder;
    guidance: string;
}

interface Step {
    key: string;
    label: string;
}

const quotationSteps: Step[] = [
    { key: 'QUOTATION', label: 'Penawaran Disusun' },
    { key: 'QUOTATION_SENT', label: 'Penawaran Dikirim' },
    { key: 'DECISION', label: 'Keputusan Pelanggan' },
];

const orderSteps: Step[] = [
    { key: 'DRAFT', label: 'Draf Pesanan' },
    { key: 'CONFIRMED', label: 'Dikonfirmasi' },
    { key: 'FULFILLMENT', label: 'Pemenuhan' },
    { key: 'SHIPPED', label: 'Dikirim' },
    { key: 'DELIVERED', label: 'Selesai' },
];

function getProgress(order: SerializedSalesOrder) {
    if (order.status.startsWith('QUOTATION')) {
        const index =
            order.status === 'QUOTATION'
                ? 0
                : order.status === 'QUOTATION_SENT'
                  ? 1
                  : 2;
        return {
            steps: quotationSteps,
            activeIndex: index,
            terminal: ['QUOTATION_REJECTED', 'QUOTATION_EXPIRED'].includes(
                order.status,
            ),
        };
    }

    const indexByStatus: Record<string, number> = {
        DRAFT: 0,
        CONFIRMED: 1,
        IN_PRODUCTION: 2,
        READY_TO_SHIP: 2,
        SHIPPED: 3,
        DELIVERED: 4,
    };
    return {
        steps: orderSteps,
        activeIndex: indexByStatus[order.status] ?? -1,
        terminal: order.status === 'CANCELLED',
    };
}

export function SalesOrderProgress({ order, guidance }: SalesOrderProgressProps) {
    const { steps, activeIndex, terminal } = getProgress(order);

    return (
        <section
            aria-labelledby="sales-order-progress-title"
            className="rounded-xl border bg-card p-5 shadow-sm"
        >
            <div>
                <h2 id="sales-order-progress-title" className="font-semibold">
                    Proses Pesanan
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{guidance}</p>
            </div>
            {terminal ? (
                <div className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Alur aktif telah ditutup. Detail perubahan tersedia pada tab
                    Audit Status.
                </div>
            ) : (
                <ol
                    className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-5"
                    aria-label="Tahapan pesanan"
                >
                    {steps.map((step, index) => {
                        const isComplete = index < activeIndex;
                        const isCurrent = index === activeIndex;
                        return (
                            <li
                                key={step.key}
                                aria-current={isCurrent ? 'step' : undefined}
                                className={
                                    'rounded-lg border p-3 ' +
                                    (isCurrent
                                        ? 'border-blue-500 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30'
                                        : isComplete
                                          ? 'border-emerald-500/40 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/20'
                                          : 'bg-muted/20')
                                }
                            >
                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                    {isComplete ? (
                                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                        <Circle
                                            className={
                                                'h-4 w-4 ' +
                                                (isCurrent
                                                    ? 'fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400'
                                                    : '')
                                            }
                                        />
                                    )}
                                    {isComplete
                                        ? 'Selesai'
                                        : isCurrent
                                          ? 'Aktif'
                                          : 'Menunggu'}
                                </div>
                                <p className="mt-2 text-sm font-semibold">
                                    {step.label}
                                </p>
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}
