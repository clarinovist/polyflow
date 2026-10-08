'use client';

import { useMemo } from 'react';
import { type ColumnDef, type SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Truck, ChevronRight } from 'lucide-react';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { salesLabels, formLabels } from '@/lib/labels';
import { getDeliveryStatusLabel } from '@/lib/sales/delivery-status';
import type { DeliveryListSort } from '@/lib/sales/delivery-list';

export interface DeliveryOrderRow {
    id: string;
    orderNumber: string;
    deliveryDate: string | Date;
    status: string;
    salesOrderId?: string | null;
    carrier?: string | null;
    salesOrder?: {
        orderNumber: string;
        customer?: { name: string } | null;
    } | null;
    sourceLocation?: { name: string } | null;
}

interface DeliveryOrderTableProps {
    initialData: DeliveryOrderRow[];
    basePath?: string;
    mode?: 'active' | 'history';
    server?: {
        page: number;
        pageSize: number;
        total: number;
        totalPages: number;
        sort: DeliveryListSort;
        direction: 'asc' | 'desc';
        onNavigate?: (updates: Record<string, string>) => void;
    };
    emptyMessage?: string;
}

export function DeliveryOrderTable({
    initialData,
    basePath = '/sales/deliveries',
    mode = 'active',
    server,
    emptyMessage,
}: DeliveryOrderTableProps) {
    const navigate = server?.onNavigate;
    const sorting: SortingState =
        server?.sort === 'orderNumber'
            ? [
                  {
                      id: 'orderNumber',
                      desc: server.direction === 'desc',
                  },
              ]
            : [];

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            PENDING:
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-200',
            LOADING:
                'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-200',
            SHIPPED:
                'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200',
            IN_TRANSIT:
                'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200',
            ARRIVED:
                'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200',
            DELIVERED:
                'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200',
            RETURNED:
                'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200',
            CANCELLED:
                'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100',
        };
        return (
            <Badge
                variant="secondary"
                className={styles[status] || styles.PENDING}
            >
                {getDeliveryStatusLabel(status)}
            </Badge>
        );
    };

    const columns: ColumnDef<DeliveryOrderRow, unknown>[] = useMemo(
        () => [
            {
                id: 'orderNumber',
                header: 'No. ' + salesLabels.deliveryOrder,
                size: 190,
                accessorFn: (row) => row.orderNumber,
                enableSorting: Boolean(server),
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <Link
                            href={basePath + '/' + row.original.id}
                            aria-label={
                                'Lihat detail ' + row.original.orderNumber
                            }
                            className="break-all rounded-sm font-mono font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            {row.original.orderNumber}
                        </Link>
                        <div className="mt-1 text-xs text-muted-foreground">
                            {format(
                                new Date(row.original.deliveryDate),
                                'dd MMM yyyy',
                            )}
                        </div>
                        {row.original.salesOrder?.orderNumber && (
                            <div className="mt-1 text-[11px] font-mono text-muted-foreground">
                                SO: {row.original.salesOrder.orderNumber}
                            </div>
                        )}
                    </div>
                ),
            },
            {
                id: 'customer',
                header: salesLabels.customer,
                size: 240,
                accessorFn: (row) => row.salesOrder?.customer?.name || '',
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="min-w-0">
                        <div className="break-words font-medium">
                            {row.original.salesOrder?.customer?.name || '-'}
                        </div>
                        {row.original.sourceLocation?.name && (
                            <div className="mt-1 break-words text-xs text-muted-foreground">
                                Gudang: {row.original.sourceLocation.name}
                            </div>
                        )}
                    </div>
                ),
            },
            {
                accessorKey: 'status',
                header: formLabels.status,
                size: 150,
                enableSorting: false,
                cell: ({ row }) => getStatusBadge(row.original.status),
            },
        ],
        [basePath, server],
    );

    const renderMobileView = (orders: DeliveryOrderRow[]) =>
        orders.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
                {emptyMessage ?? salesLabels.emptyDeliveries}
            </div>
        ) : (
            <ul
                aria-label={
                    'Daftar Surat Jalan ' +
                    (mode === 'history' ? 'riwayat' : 'aktif') +
                    ' mobile'
                }
                className="space-y-3"
            >
                {orders.map((order) => (
                    <li key={order.id}>
                        <Card className="gap-3 overflow-hidden py-4">
                            <CardHeader className="px-4">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-2">
                                        <Truck
                                            aria-hidden="true"
                                            className="mt-1 h-4 w-4 shrink-0 text-primary"
                                        />
                                        <div className="min-w-0">
                                            <Link
                                                href={basePath + '/' + order.id}
                                                aria-label={
                                                    'Lihat detail ' +
                                                    order.orderNumber
                                                }
                                                className="block break-all rounded-sm font-mono font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                            >
                                                {order.orderNumber}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">
                                                {format(
                                                    new Date(
                                                        order.deliveryDate,
                                                    ),
                                                    'dd MMM yyyy',
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                    {getStatusBadge(order.status)}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3 px-4 text-sm">
                                <dl className="grid grid-cols-2 gap-3">
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">
                                            Customer
                                        </dt>
                                        <dd className="break-words font-medium">
                                            {order.salesOrder?.customer?.name ||
                                                '-'}
                                        </dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-xs text-muted-foreground">
                                            Gudang
                                        </dt>
                                        <dd className="break-words">
                                            {order.sourceLocation?.name || '-'}
                                        </dd>
                                    </div>
                                </dl>
                                <Link
                                    href={basePath + '/' + order.id}
                                    className="flex min-h-11 items-center justify-end border-t pt-3 font-medium text-primary"
                                >
                                    Lihat Detail
                                    <ChevronRight
                                        aria-hidden="true"
                                        className="ml-1 h-4 w-4"
                                    />
                                </Link>
                            </CardContent>
                        </Card>
                    </li>
                ))}
            </ul>
        );

    return (
        <DataTable
            columns={columns}
            data={initialData}
            emptyMessage={emptyMessage ?? salesLabels.emptyDeliveries}
            minWidth={650}
            caption={
                mode === 'history'
                    ? 'Riwayat Surat Jalan'
                    : 'Daftar Surat Jalan aktif'
            }
            renderMobileView={renderMobileView}
            manualSorting={Boolean(server)}
            sorting={sorting}
            onSortingChange={(next) => {
                const first = next[0];
                if (!server || !navigate) return;
                if (!first) {
                    navigate({
                        page: '1',
                        sort: 'priority',
                        direction: 'desc',
                    });
                    return;
                }
                navigate({
                    page: '1',
                    sort: 'orderNumber',
                    direction: first.desc ? 'desc' : 'asc',
                });
            }}
            serverPagination={
                server && navigate
                    ? {
                          pageIndex: Math.max(server.page - 1, 0),
                          pageCount: server.totalPages,
                          totalCount: server.total,
                          pageSize: server.pageSize,
                          pageSizeOptions: [25, 50, 100],
                          onPageChange: (index) =>
                              navigate({ page: String(index + 1) }),
                          onPageSizeChange: (size) =>
                              navigate({ page: '1', pageSize: String(size) }),
                      }
                    : undefined
            }
        />
    );
}
