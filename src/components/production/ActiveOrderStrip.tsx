'use client';

import Link from 'next/link';
import type { ActiveOrderNavItem } from '@/actions/production/active-order-nav';

interface ActiveOrderStripProps {
    orders: ActiveOrderNavItem[];
    currentOrderId: string;
}

/**
 * Horizontal strip of active SPK shown on the work-order detail page.
 *
 * Removes the need to return to /production/daily just to reach the next SPK.
 * Carries the progress percentage so the other reason for going back (checking
 * overall status) is covered here too.
 */
export function ActiveOrderStrip({
    orders,
    currentOrderId,
}: ActiveOrderStripProps) {
    // One active SPK means there is nowhere to navigate — the strip would only
    // repeat the header.
    if (orders.length <= 1) return null;

    const currentIndex = orders.findIndex((o) => o.id === currentOrderId);

    return (
        <div className="mb-6 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-muted-foreground">
                    SPK Aktif
                </span>
                <span className="text-[10px] text-muted-foreground">
                    {currentIndex >= 0
                        ? `${currentIndex + 1} dari ${orders.length}`
                        : `${orders.length} SPK`}
                </span>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {orders.map((order) => {
                    const isCurrent = order.id === currentOrderId;
                    return (
                        <Link
                            key={order.id}
                            href={`/production/orders/${order.id}`}
                            aria-current={isCurrent ? 'page' : undefined}
                            className={`shrink-0 w-44 rounded-lg border p-2.5 transition-colors ${
                                isCurrent
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:bg-muted/50'
                            }`}
                        >
                            <div className="font-mono text-[10px] text-muted-foreground truncate">
                                {order.orderNumber}
                            </div>
                            <div className="text-xs font-semibold text-foreground truncate mt-0.5">
                                {order.productName}
                            </div>
                            <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-primary"
                                    style={{
                                        width: `${order.progressPercent}%`,
                                    }}
                                />
                            </div>
                            <div className="mt-1 text-[10px] text-muted-foreground">
                                {order.progressPercent}% ·{' '}
                                {order.actualQuantity.toLocaleString('id-ID')}/
                                {order.plannedQuantity.toLocaleString('id-ID')}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
