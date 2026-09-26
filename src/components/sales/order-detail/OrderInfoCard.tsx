import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { salesLabels, formLabels } from '@/lib/labels';
import { format } from 'date-fns';
import { formatRupiah } from '@/lib/utils/utils';
import {
    getEnteredQuantityDisplay,
    getEnteredUnitPriceDisplay,
} from '@/lib/utils/production-units';
import { isBillableDeliveryStatus } from '@/lib/sales/delivery-status';
import { SALES_LOST_REASON_LABELS } from '@/lib/sales/order-phase';
import type { SerializedSalesOrder } from '../sales-order-types';

interface OrderInfoCardProps {
    order: SerializedSalesOrder;
    warehouseMode: boolean;
    customerLabel: string;
    isLegacyInternalOrder: boolean;
    isMaklonOrder: boolean;
    followUpDate: Date | null;
    isFollowUpOverdue: boolean;
}

export function OrderInfoCard({
    order,
    warehouseMode,
    customerLabel,
    isLegacyInternalOrder,
    isMaklonOrder,
    followUpDate,
    isFollowUpOverdue,
}: OrderInfoCardProps) {
    const showDpp =
        !warehouseMode &&
        order.items.some(
            (item) =>
                Number(item.taxPercent || 0) > 0 || Number(item.taxAmount || 0) > 0,
        );
    const summaryColSpan = showDpp ? 5 : 4;

    return (
        <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
                <CardTitle>Detail Pesanan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere]">
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            {salesLabels.customer}
                        </h3>
                        <p className="text-lg">{customerLabel}</p>
                        <p className="text-sm text-muted-foreground">
                            {order.customer?.email ||
                                (isLegacyInternalOrder
                                    ? 'No customer assigned'
                                    : 'No email')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {order.customer?.phone || ''}
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            {isMaklonOrder
                                ? 'Lokasi Produksi'
                                : salesLabels.sourceWarehouse}
                        </h3>
                        <p className="text-lg">
                            {order.sourceLocation?.name || 'N/A'}
                        </p>
                        {isMaklonOrder && (
                            <p className="text-sm text-muted-foreground">
                                Dipakai sebagai lokasi produksi/default
                                consumption location untuk work order maklon.
                            </p>
                        )}
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            {salesLabels.expectedDate}
                        </h3>
                        <p>
                            {order.expectedDate
                                ? format(new Date(order.expectedDate), 'PPP')
                                : '-'}
                        </p>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            {salesLabels.orderType}
                        </h3>
                        <Badge variant="outline">
                            {order.orderType.replace(/_/g, ' ')}
                        </Badge>
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-muted-foreground">
                            Follow-up
                        </h3>
                        {followUpDate ? (
                            <div className="flex flex-wrap items-center gap-2">
                                <p
                                    className={
                                        isFollowUpOverdue
                                            ? 'text-destructive font-medium'
                                            : ''
                                    }
                                >
                                    {format(followUpDate, 'PPP')}
                                </p>
                                {isFollowUpOverdue && (
                                    <Badge variant="destructive">
                                        Terlambat
                                    </Badge>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Belum dijadwalkan
                            </p>
                        )}
                    </div>

                    {(order as { lostReason?: string | null }).lostReason &&
                        order.status === 'QUOTATION_REJECTED' && (
                            <div>
                                <h3 className="font-semibold text-sm text-muted-foreground">
                                    Alasan Kalah
                                </h3>
                                <p className="font-medium">
                                    {(() => {
                                        const lr = (
                                            order as {
                                                lostReason?: string | null;
                                            }
                                        ).lostReason as string;
                                        return (
                                            SALES_LOST_REASON_LABELS[lr] ?? lr
                                        );
                                    })()}
                                </p>
                                {(
                                    order as {
                                        lostReasonNotes?: string | null;
                                    }
                                ).lostReasonNotes && (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                                        {
                                            (
                                                order as {
                                                    lostReasonNotes?:
                                                        | string
                                                        | null;
                                                }
                                            ).lostReasonNotes
                                        }
                                    </p>
                                )}
                            </div>
                        )}
                </div>

                {order.notes && (
                    <div className="bg-muted/50 p-4 rounded-md">
                        <h3 className="font-semibold text-sm mb-1">
                            {formLabels.notes}
                        </h3>
                        <p className="text-sm whitespace-pre-wrap">
                            {order.notes}
                        </p>
                    </div>
                )}

                <div
                    className="border rounded-lg overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    role="region"
                    aria-label="Rincian item pesanan"
                    tabIndex={0}
                >
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                            <tr>
                                <th className="h-10 px-4 text-left font-medium">
                                    {formLabels.product}
                                </th>
                                <th className="h-10 px-4 text-right font-medium">
                                    {formLabels.qty}
                                </th>
                                <th className="h-10 px-4 text-right font-medium">
                                    Terkirim
                                </th>
                                {!warehouseMode && (
                                    <th className="h-10 px-4 text-right font-medium">
                                        {formLabels.unitPrice}
                                    </th>
                                )}
                                {showDpp && (
                                    <th className="h-10 px-4 text-right font-medium">
                                        DPP
                                    </th>
                                )}
                                {!warehouseMode && (
                                    <th className="h-10 px-4 text-right font-medium">
                                        {formLabels.subtotal}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {order.items.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/50">
                                    <td className="p-4">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <div className="font-medium">
                                                {
                                                    item.productVariant.product
                                                        .name
                                                }
                                            </div>
                                            {(item.isFreeItem ||
                                                Number(item.unitPrice) ===
                                                    0) && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 h-4 font-normal bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                                >
                                                    Sampel / Gratis
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {item.productVariant.name} -{' '}
                                            {item.productVariant.skuCode}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        {getEnteredQuantityDisplay({
                                            ...item,
                                            ...item.productVariant,
                                        })}
                                    </td>
                                    <td className="p-4 text-right">
                                        <span
                                            className={
                                                Number(item.deliveredQty) > 0
                                                    ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                                    : 'text-muted-foreground'
                                            }
                                        >
                                            {getEnteredQuantityDisplay({
                                                ...item,
                                                ...item.productVariant,
                                                quantity: item.deliveredQty,
                                                enteredQuantity:
                                                    item.enteredQuantity &&
                                                    Number(item.quantity) > 0
                                                        ? (Number(
                                                              item.enteredQuantity,
                                                          ) *
                                                              Number(
                                                                  item.deliveredQty,
                                                              )) /
                                                          Number(item.quantity)
                                                        : null,
                                            })}
                                        </span>
                                    </td>
                                    {!warehouseMode && (
                                        <td className="p-4 text-right">
                                            {(() => {
                                                const price =
                                                    getEnteredUnitPriceDisplay({
                                                        ...item,
                                                        ...item.productVariant,
                                                    });
                                                return `${formatRupiah(price.price)}/${price.unit}`;
                                            })()}
                                        </td>
                                    )}
                                    {showDpp && (
                                        <td className="p-4 text-right text-muted-foreground">
                                            {item.dppOtherAmount
                                                ? formatRupiah(
                                                      Number(item.dppOtherAmount),
                                                  )
                                                : '-'}
                                        </td>
                                    )}
                                    {!warehouseMode && (
                                        <td className="p-4 text-right font-medium">
                                            {formatRupiah(
                                                Number(item.subtotal),
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        {!warehouseMode && (
                            <tfoot className="bg-muted/50 border-t [&_td:last-child]:whitespace-nowrap">
                                {Number(order.discountAmount) > 0 && (
                                    <tr>
                                        <td
                                            colSpan={summaryColSpan}
                                            className="p-2 text-right text-sm text-muted-foreground"
                                        >
                                            Diskon
                                        </td>
                                        <td className="p-2 text-right text-sm text-red-500">
                                            -
                                            {formatRupiah(
                                                Number(order.discountAmount),
                                            )}
                                        </td>
                                    </tr>
                                )}
                                {Number(order.taxAmount) > 0 && (
                                    <tr>
                                        <td
                                            colSpan={summaryColSpan}
                                            className="p-2 text-right text-sm text-muted-foreground"
                                        >
                                            PPN
                                            {(() => {
                                                // Check if any item has INCLUDE mode
                                                const hasInclude =
                                                    order.items.some(
                                                        (item: {
                                                            ppnMode?: string;
                                                        }) =>
                                                            item.ppnMode ===
                                                            'INCLUDE',
                                                    );
                                                const hasExclude =
                                                    order.items.some(
                                                        (item: {
                                                            ppnMode?: string;
                                                        }) =>
                                                            item.ppnMode ===
                                                                'EXCLUDE' ||
                                                            !item.ppnMode,
                                                    );
                                                if (hasInclude && !hasExclude) {
                                                    return (
                                                        <span className="ml-1 text-xs">
                                                            (Include)
                                                        </span>
                                                    );
                                                } else if (
                                                    hasInclude &&
                                                    hasExclude
                                                ) {
                                                    return (
                                                        <span className="ml-1 text-xs">
                                                            (Campur)
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </td>
                                        <td className="p-2 text-right text-sm">
                                            {formatRupiah(
                                                Number(order.taxAmount),
                                            )}
                                        </td>
                                    </tr>
                                )}
                                {Number(order.shippingCost || 0) > 0 && (
                                    <tr>
                                        <td
                                            colSpan={summaryColSpan}
                                            className="p-2 text-right text-sm text-muted-foreground"
                                        >
                                            Ongkos Kirim
                                            {Array.isArray(
                                                order.deliveryOrders,
                                            ) &&
                                                order.deliveryOrders.some(
                                                    (d) =>
                                                        d.totalCharge != null &&
                                                        isBillableDeliveryStatus(
                                                            d.status,
                                                        ),
                                                ) && (
                                                    <span className="ml-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                                                        (dari armada)
                                                    </span>
                                                )}
                                        </td>
                                        <td className="p-2 text-right text-sm">
                                            {formatRupiah(
                                                Number(order.shippingCost),
                                            )}
                                        </td>
                                    </tr>
                                )}
                                <tr>
                                    <td
                                        colSpan={summaryColSpan}
                                        className="p-4 text-right font-bold"
                                    >
                                        Total Keseluruhan
                                    </td>
                                    <td className="p-4 text-right font-bold text-lg">
                                        {formatRupiah(
                                            Number(order.totalAmount),
                                        )}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}
