'use client';

import { useMemo } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { format } from 'date-fns';
import {
    SalesOrder,
    SalesOrderStatus,
    Customer,
    Location,
    InvoiceStatus,
} from '@prisma/client';
import { FileText, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';
import { getSalesStatusLabel, formLabels, salesLabels } from '@/lib/labels';

type SerializedSalesOrder = Omit<
    SalesOrder,
    'totalAmount' | 'nextFollowUpDate'
> & {
    totalAmount: number | null;
    nextFollowUpDate?: string | Date | null;
    priceStatus?: 'PENDING' | 'PROVISIONAL' | 'FINAL' | null;
    customer:
        | (Omit<
              Customer,
              | 'creditLimit'
              | 'discountPercent'
              | 'maxDiscountPercent'
              | 'latitude'
              | 'longitude'
          > & {
              creditLimit: number | null;
              discountPercent: number | null;
              maxDiscountPercent: number | null;
              latitude: number | null;
              longitude: number | null;
          })
        | null;
    sourceLocation: Location | null;
    items?: Array<{
        productVariant: {
            name: string;
            product: {
                name: string;
            };
        };
    }>;
    invoices?: Array<{
        id: string;
        invoiceNumber: string;
        status: InvoiceStatus;
        totalAmount: number;
        paidAmount: number;
        invoiceDate: string | Date;
        dueDate?: string | Date | null;
    }>;
    _count: { items: number };
};

function getPriceStatusMeta(
    ps: string | null | undefined,
): { label: string; cls: string } | null {
    if (!ps) return null;
    const map: Record<string, { label: string; cls: string }> = {
        PENDING: {
            label: 'Harga blm final',
            cls: 'bg-red-100 text-red-700 border-red-200',
        },
        PROVISIONAL: {
            label: 'Harga sementara',
            cls: 'bg-amber-100 text-amber-700 border-amber-200',
        },
        FINAL: {
            label: 'Harga final',
            cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
        },
    };
    return map[ps] ?? null;
}

interface SalesOrderTableProps {
    initialData: SerializedSalesOrder[];
    basePath?: string;
    emptyMessage?: string;
}

export function SalesOrderTable({
    initialData,
    basePath = '/sales/orders',
    emptyMessage,
}: SalesOrderTableProps) {
    const router = useRouter();

    const getCustomerLabel = (order: SerializedSalesOrder) =>
        order.customer?.name || formLabels.legacyInternalOrder;

    const isMaklonOrder = (order: SerializedSalesOrder) =>
        order.orderType === 'MAKLON_JASA';

    const getOrderTypeLabel = (order: SerializedSalesOrder) => {
        switch (order.orderType) {
            case 'MAKE_TO_STOCK':
                return salesLabels.fulfillFromStock;
            case 'MAKE_TO_ORDER':
                return salesLabels.fulfillProduce;
            case 'MAKLON_JASA':
                return salesLabels.fulfillMaklon;
            default:
                return formLabels.unknown;
        }
    };

    const getSalesOrderStatusLabel = (order: SerializedSalesOrder) =>
        getSalesStatusLabel(order.status, order.orderType);

    const getLocationLabel = (order: SerializedSalesOrder) => {
        const locationName = order.sourceLocation?.name || '-';
        return isMaklonOrder(order) ? `Prod: ${locationName}` : locationName;
    };

    const getItemSummary = (order: SerializedSalesOrder) => {
        if (!order.items?.length) return `${order._count.items} item`;
        const productNames = order.items.slice(0, 2).map((item) => {
            const variant = item.productVariant;
            return variant.product.name === variant.name
                ? variant.name
                : `${variant.product.name} - ${variant.name}`;
        });
        const remainder = order.items.length - productNames.length;
        return remainder > 0
            ? `${productNames.join(', ')} +${remainder} lagi`
            : productNames.join(', ');
    };

    const getStatusColor = (status: SalesOrderStatus) => {
        switch (status) {
            case 'QUOTATION':
                return 'bg-cyan-100 text-cyan-800 border-cyan-200';
            case 'QUOTATION_SENT':
                return 'bg-sky-100 text-sky-800 border-sky-200';
            case 'QUOTATION_REJECTED':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'QUOTATION_EXPIRED':
                return 'bg-orange-100 text-orange-800 border-orange-200';
            case 'DRAFT':
                return 'bg-slate-100 text-slate-800 border-slate-200';
            case 'CONFIRMED':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'IN_PRODUCTION':
                return 'bg-amber-100 text-amber-800 border-amber-200';
            case 'READY_TO_SHIP':
                return 'bg-indigo-100 text-indigo-800 border-indigo-200';
            case 'SHIPPED':
                return 'bg-purple-100 text-purple-800 border-purple-200';
            case 'DELIVERED':
                return 'bg-emerald-100 text-emerald-800 border-emerald-200';
            case 'CANCELLED':
                return 'bg-red-100 text-red-800 border-red-200';
            default:
                return 'bg-slate-100 text-slate-800';
        }
    };

    const getPaymentSummary = (order: SerializedSalesOrder) => {
        const invoices = order.invoices || [];
        if (invoices.length === 0) {
            return {
                label: 'Belum invoice',
                badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
                outstanding: 0,
            };
        }
        const outstanding = invoices.reduce((sum, invoice) => {
            const remaining =
                Number(invoice.totalAmount || 0) -
                Number(invoice.paidAmount || 0);
            return remaining > 0 ? sum + remaining : sum;
        }, 0);
        if (outstanding > 0) {
            return {
                label: 'Belum lunas',
                badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
                outstanding,
            };
        }
        return {
            label: 'Lunas',
            badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
            outstanding: 0,
        };
    };

    const hasQuotationPhase = useMemo(
        () =>
            initialData.some(
                (o) =>
                    o.status === 'QUOTATION' || o.status === 'QUOTATION_SENT',
            ),
        [initialData],
    );

    const columns: ColumnDef<SerializedSalesOrder, unknown>[] = useMemo(
        () => [
            {
                id: 'orderNumber',
                header: salesLabels.orderNumber,
                size: 160,
                accessorFn: (row) => row.orderNumber,
                sortingFn: (a, b) =>
                    new Date(a.original.orderDate).getTime() -
                    new Date(b.original.orderDate).getTime(),
                cell: ({ row }) => (
                    <div>
                        <button
                            onClick={() =>
                                router.push(`${basePath}/${row.original.id}`)
                            }
                            className="flex items-center gap-2 text-left hover:underline cursor-pointer"
                        >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                                {row.original.orderNumber}
                            </span>
                        </button>
                        <div className="text-xs text-muted-foreground ml-6">
                            {format(
                                new Date(row.original.orderDate),
                                'MMM d, yyyy',
                            )}
                        </div>
                    </div>
                ),
            },
            {
                id: 'customer',
                header: salesLabels.customer,
                size: 220,
                accessorFn: (row) => row.customer?.name || '',
                cell: ({ row }) => {
                    const locationLabel = getLocationLabel(row.original);
                    return (
                        <div className="min-w-0">
                            <div
                                className="font-medium truncate"
                                title={getCustomerLabel(row.original)}
                            >
                                {getCustomerLabel(row.original)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                                <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 h-4 font-normal shrink-0"
                                >
                                    {getOrderTypeLabel(row.original)}
                                </Badge>
                                {locationLabel && locationLabel !== '-' && (
                                    <>
                                        <span>·</span>
                                        <span
                                            className="truncate"
                                            title={locationLabel}
                                        >
                                            {locationLabel}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    );
                },
            },
            {
                accessorKey: 'status',
                header: formLabels.status,
                size: 200,
                cell: ({ row }) => {
                    const statusLabel = getSalesOrderStatusLabel(row.original);
                    const psMeta = getPriceStatusMeta(
                        (row.original as { priceStatus?: string | null })
                            .priceStatus,
                    );
                    return (
                        <div className="flex flex-col gap-1 items-start">
                            <Badge
                                variant="secondary"
                                className={getStatusColor(row.original.status)}
                                title={statusLabel}
                            >
                                {statusLabel}
                            </Badge>
                            {psMeta && (
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] px-1.5 h-4 font-normal ${psMeta.cls}`}
                                    title={psMeta.label}
                                >
                                    {psMeta.label}
                                </Badge>
                            )}
                        </div>
                    );
                },
            },
            {
                id: 'payment',
                header: salesLabels.payment,
                size: 140,
                accessorFn: (row) => getPaymentSummary(row).label,
                cell: ({ row }) => {
                    const summary = getPaymentSummary(row.original);
                    return (
                        <div>
                            <Badge
                                variant="secondary"
                                className={summary.badgeClass}
                            >
                                {summary.label}
                            </Badge>
                            {summary.outstanding > 0 && (
                                <div className="text-xs text-amber-700 mt-0.5 font-medium">
                                    {formatRupiah(summary.outstanding)}
                                </div>
                            )}
                        </div>
                    );
                },
            },
            ...(hasQuotationPhase
                ? [
                      {
                          id: 'followUp',
                          header: 'Follow-up',
                          size: 140,
                          accessorFn: (row: SerializedSalesOrder) =>
                              row.nextFollowUpDate
                                  ? new Date(
                                        row.nextFollowUpDate as Date | string,
                                    ).getTime()
                                  : 0,
                          cell: ({
                              row,
                          }: {
                              row: { original: SerializedSalesOrder };
                          }) => {
                              const v = row.original.nextFollowUpDate;
                              if (!v)
                                  return (
                                      <span className="text-xs text-muted-foreground">
                                          -
                                      </span>
                                  );
                              const d = new Date(v as Date | string);
                              if (isNaN(d.getTime()))
                                  return (
                                      <span className="text-xs text-muted-foreground">
                                          -
                                      </span>
                                  );
                              const isOverdue =
                                  d.getTime() <
                                  new Date(
                                      new Date().setHours(0, 0, 0, 0),
                                  ).getTime();
                              const isQuotation =
                                  row.original.status === 'QUOTATION' ||
                                  row.original.status === 'QUOTATION_SENT';
                              if (!isQuotation)
                                  return (
                                      <span className="text-xs text-muted-foreground">
                                          -
                                      </span>
                                  );
                              return (
                                  <Badge
                                      variant={
                                          isOverdue ? 'destructive' : 'outline'
                                      }
                                      className="text-[11px]"
                                  >
                                      {format(d, 'dd MMM yyyy')}
                                      {isOverdue ? ' · Terlambat' : ''}
                                  </Badge>
                              );
                          },
                      } as ColumnDef<SerializedSalesOrder, unknown>,
                  ]
                : []),
            {
                accessorKey: 'totalAmount',
                header: () => (
                    <div className="text-right">{formLabels.total}</div>
                ),
                size: 140,
                cell: ({ row }) => (
                    <div className="text-right font-medium">
                        {row.original.totalAmount
                            ? formatRupiah(Number(row.original.totalAmount))
                            : '-'}
                    </div>
                ),
            },
        ],
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );

    const renderMobileView = (orders: SerializedSalesOrder[]) => (
        <>
            {orders.length === 0 ? (
                <div className="text-center p-4 text-muted-foreground border rounded-lg border-dashed">
                    {emptyMessage || salesLabels.emptyOrders}
                </div>
            ) : (
                orders.map((order) => {
                    const paymentSummary = getPaymentSummary(order);
                    return (
                        <Card
                            key={order.id}
                            className="overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                            onClick={() =>
                                router.push(`${basePath}/${order.id}`)
                            }
                        >
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex items-center gap-2">
                                        <div className="bg-primary/10 p-1.5 rounded-full">
                                            <FileText className="h-4 w-4 text-primary" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-sm">
                                                {order.orderNumber}
                                            </h3>
                                            <p className="text-xs text-muted-foreground">
                                                {format(
                                                    new Date(order.orderDate),
                                                    'MMM d, yyyy',
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1 items-end">
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] px-1.5 h-5 ${getStatusColor(order.status)}`}
                                        >
                                            {getSalesOrderStatusLabel(order)}
                                        </Badge>
                                        {(() => {
                                            const m = getPriceStatusMeta(
                                                (
                                                    order as {
                                                        priceStatus?:
                                                            | string
                                                            | null;
                                                    }
                                                ).priceStatus,
                                            );
                                            return m ? (
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[9px] px-1 h-3.5 font-normal ${m.cls}`}
                                                >
                                                    {m.label}
                                                </Badge>
                                            ) : null;
                                        })()}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-1">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                                {salesLabels.customer}
                                            </p>
                                            <p className="font-medium truncate">
                                                {getCustomerLabel(order)}
                                            </p>
                                            {!order.customer && (
                                                <p className="text-[10px] text-amber-700">
                                                    Legacy internal order
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] text-muted-foreground uppercase font-semibold">
                                                {formLabels.total}
                                            </p>
                                            <p className="font-semibold text-primary">
                                                {order.totalAmount
                                                    ? formatRupiah(
                                                          Number(
                                                              order.totalAmount,
                                                          ),
                                                      )
                                                    : '-'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                                        <span className="text-muted-foreground">
                                            {formLabels.type}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="outline"
                                                className="text-[10px]"
                                            >
                                                {getOrderTypeLabel(order)}
                                            </Badge>
                                            <span className="text-muted-foreground">
                                                {getLocationLabel(order)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                                        <span className="text-muted-foreground">
                                            {salesLabels.payment}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant="secondary"
                                                className={`text-[10px] ${paymentSummary.badgeClass}`}
                                            >
                                                {paymentSummary.label}
                                            </Badge>
                                            {paymentSummary.outstanding > 0 && (
                                                <span className="font-medium text-amber-700">
                                                    {formatRupiah(
                                                        paymentSummary.outstanding,
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground text-[11px]">
                                        <div className="flex items-center gap-1">
                                            <span>
                                                • {getItemSummary(order)}
                                            </span>
                                        </div>
                                        <div className="flex items-center text-primary font-medium">
                                            Lihat Detail{' '}
                                            <ChevronRight className="h-3 w-3 ml-0.5" />
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    );
                })
            )}
        </>
    );

    return (
        <div className="rounded-md border-none sm:border">
            <DataTable
                columns={columns}
                data={initialData}
                emptyMessage={emptyMessage || salesLabels.emptyOrders}
                minWidth={780}
                renderMobileView={renderMobileView}
            />
        </div>
    );
}
