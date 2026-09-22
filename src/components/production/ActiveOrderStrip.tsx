'use client';

import Link from 'next/link';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ActiveOrderNavItem } from '@/actions/production/active-order-nav';

interface ActiveOrderStripProps {
    orders: ActiveOrderNavItem[];
    currentOrderId: string;
}

/** Compact navigation keeps all active orders reachable without hiding the detail tabs. */
export function ActiveOrderStrip({
    orders,
    currentOrderId,
}: ActiveOrderStripProps) {
    if (orders.length <= 1) return null;
    const currentIndex = orders.findIndex(
        (order) => order.id === currentOrderId,
    );
    const previous = currentIndex > 0 ? orders[currentIndex - 1] : undefined;
    const next = currentIndex >= 0 ? orders[currentIndex + 1] : undefined;
    return (
        <nav aria-label="SPK aktif" className="mb-4 flex items-start gap-2">
            <details className="group min-w-0 flex-1 rounded-lg border bg-card">
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                    <span className="font-medium">SPK Aktif</span>
                    <span className="text-xs text-muted-foreground">
                        {currentIndex >= 0
                            ? `${currentIndex + 1} dari ${orders.length}`
                            : `${orders.length} SPK`}
                    </span>
                    <span className="ml-auto hidden truncate text-xs text-muted-foreground sm:inline">
                        {orders[currentIndex]?.orderNumber || 'Pilih SPK'}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid max-h-72 grid-cols-1 gap-2 overflow-auto border-t p-3 sm:grid-cols-2 xl:grid-cols-4">
                    {orders.map((order) => (
                        <Link
                            key={order.id}
                            href={`/production/orders/${order.id}`}
                            aria-current={
                                order.id === currentOrderId ? 'page' : undefined
                            }
                            className={`min-w-0 rounded-lg border p-3 hover:bg-muted/50 ${order.id === currentOrderId ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : ''}`}
                        >
                            <p className="font-mono text-xs text-muted-foreground">
                                {order.orderNumber}
                            </p>
                            <p className="mt-1 break-words text-sm font-medium">
                                {order.productName}
                            </p>
                            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
                                {order.progressPercent}% ·{' '}
                                {order.actualQuantity.toLocaleString('id-ID')}/
                                {order.plannedQuantity.toLocaleString('id-ID')}
                            </p>
                        </Link>
                    ))}
                </div>
            </details>
            {previous && (
                <Link
                    href={`/production/orders/${previous.id}`}
                    aria-label={`SPK sebelumnya: ${previous.orderNumber}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
                >
                    <ChevronLeft className="h-4 w-4" />
                </Link>
            )}
            {next && (
                <Link
                    href={`/production/orders/${next.id}`}
                    aria-label={`SPK berikutnya: ${next.orderNumber}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border hover:bg-muted"
                >
                    <ChevronRight className="h-4 w-4" />
                </Link>
            )}
        </nav>
    );
}
