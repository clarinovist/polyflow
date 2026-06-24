'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { ArrowLeft, Truck, User, Calendar, MapPin, CheckCircle2, Clock, Check, Printer } from 'lucide-react';
import Link from 'next/link';
import { salesLabels, formLabels, actionLabels, getStatusLabel } from '@/lib/labels';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { deliverSalesOrder } from '@/actions/sales/sales';
import { toast } from 'sonner';
import { getEnteredQuantityDisplay } from '@/lib/utils/production-units';


interface DeliveryOrderDetailProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    order: any;
}

export function DeliveryOrderDetail({ order }: DeliveryOrderDetailProps) {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleDeliver = async () => {
        setIsLoading(true);
        try {
            const result = await deliverSalesOrder(order.salesOrderId);
            if (result.success) {
                toast.success('Pesanan berhasil ditandai sebagai terkirim');
                router.refresh();
            } else {
                toast.error(result.error || 'Gagal memperbarui status. Silakan coba lagi.');
            }
        } catch (_error) {
            toast.error('Terjadi kesalahan yang tidak terduga. Silakan coba lagi.');
        } finally {
            setIsLoading(false);
        }
    };
    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
            SHIPPED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
            DELIVERED: 'bg-green-100 text-green-800 dark:bg-emerald-900/20 dark:text-emerald-400',
            RETURNED: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400',
            CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-zinc-400',
        };
        return (
            <Badge variant="secondary" className={styles[status] || styles.PENDING}>
                {status}
            </Badge>
        );
    };

    const statusSteps = [
        { status: 'PENDING', icon: Clock, label: 'Pesanan Terkonfirmasi' },
        { status: 'SHIPPED', icon: Truck, label: 'Dikirim' },
        { status: 'DELIVERED', icon: CheckCircle2, label: 'Terkirim' },
    ];

    const currentStatusIndex = statusSteps.findIndex(s => s.status === order.status);

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="sm" asChild>
                    <Link href="/sales/deliveries">
                        <ArrowLeft className="mr-2 h-4 w-4" /> {actionLabels.back}
                    </Link>
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{salesLabels.deliveryOrder} {order.orderNumber}</h1>
                    <div className="flex items-center gap-3 mt-1">
                        {getStatusBadge(order.status)}
                        {order.status === 'SHIPPED' && (
                            <Button
                                size="sm"
                                className="h-7 bg-green-600 hover:bg-green-700 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white px-2 text-xs"
                                onClick={handleDeliver}
                                disabled={isLoading}
                            >
                                <Check className="mr-1 h-3.5 w-3.5" /> Tandai Terkirim
                            </Button>
                        )}
                        <span className="text-muted-foreground text-sm">
                            Terkait dengan <Link href={`/sales/orders/${order.salesOrderId}`} className="text-blue-600 dark:text-blue-400 hover:underline">{order.salesOrder?.orderNumber}</Link>
                        </span>
                        <button
                            onClick={() => window.open(`/sales/deliveries/${order.id}/print`, '_blank')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-md text-xs font-medium transition-colors ml-2"
                        >
                            <Printer className="h-3.5 w-3.5" />
                            Cetak Surat Jalan
                        </button>
                    </div>
                </div>
            </div>

            {/* Tracking Banner */}
            {order.status === 'SHIPPED' && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 rounded-lg flex items-start gap-4">
                    <div className="bg-blue-100 dark:bg-blue-800 p-2 rounded-full">
                        <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-blue-900 dark:text-blue-300">Pengiriman dalam Perjalanan</h3>
                        <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                            {order.carrier ? `${order.carrier}` : 'Informasi kurir tersedia.'}
                            {order.trackingNumber && (
                                <> No. Resi: <span className="font-mono font-bold">{order.trackingNumber}</span></>
                            )}
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Item Pengiriman</CardTitle>
                            <CardDescription>Item yang termasuk dalam batch pengiriman ini</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50 border-b">
                                        <tr>
                                            <th className="h-10 px-4 text-left font-medium">{formLabels.product}</th>
                                            <th className="h-10 px-4 text-right font-medium">SKU</th>
                                            <th className="h-10 px-4 text-right font-medium">{formLabels.qty}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {order.items.map((item: any) => (
                                            <tr key={item.id} className="hover:bg-muted/50">
                                                <td className="p-4">
                                                    <div className="font-medium">{item.productVariant?.product?.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {item.productVariant?.name}
                                                    </div>
                                                </td>
                                                <td className="p-4 text-right font-mono text-xs">{item.productVariant?.skuCode}</td>
                                                <td className="p-4 text-right font-medium">
                                                    {getEnteredQuantityDisplay({ ...item, ...item.productVariant })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Timeline</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 dark:before:via-slate-600 before:to-transparent">
                                {statusSteps.map((step, idx) => {
                                    const isCompleted = idx <= currentStatusIndex;
                                    const Icon = step.icon;
                                    return (
                                        <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white dark:border-slate-700 bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 group-[.is-active]:bg-emerald-500 group-[.is-active]:text-emerald-50 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                                                <Icon className={`h-5 w-5 ${isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                                            </div>
                                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-zinc-900 shadow">
                                                <div className="flex items-center justify-between space-x-2 mb-1">
                                                    <div className={`font-bold ${isCompleted ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'}`}>{step.label}</div>
                                                    {isCompleted && idx === 1 && (
                                                        <time className="font-caveat font-medium text-indigo-500">{format(new Date(order.deliveryDate), 'PP')}</time>
                                                    )}
                                                </div>
                                                <div className="text-slate-500 dark:text-slate-400">
                                                    {isCompleted ? `Status tercapai: ${getStatusLabel(step.status, 'sales')}` : 'Menunggu...'}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Informasi Pengiriman</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                                    <User className="h-3 w-3" /> Customer
                                </label>
                                <p className="font-medium">{order.salesOrder?.customer?.name || 'N/A'}</p>
                                <p className="text-sm text-muted-foreground">{order.salesOrder?.customer?.shippingAddress}</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                                    <MapPin className="h-3 w-3" /> Asal Gudang
                                </label>
                                <p className="font-medium text-sm">{order.sourceLocation?.name}</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                                    <Calendar className="h-3 w-3" /> {salesLabels.deliveryDate}
                                </label>
                                <p className="font-medium text-sm">{format(new Date(order.deliveryDate), 'PPP')}</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-medium text-muted-foreground uppercase flex items-center gap-1">
                                    <User className="h-3 w-3" /> Disiapkan Oleh
                                </label>
                                <p className="font-medium text-sm">{order.createdBy?.name || 'Sistem'}</p>
                            </div>
                        </CardContent>
                    </Card>

                    {order.notes && (
                        <Card>
                            <CardHeader>
                                <CardTitle>{formLabels.notes}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm border-l-2 border-yellow-400 dark:border-yellow-500 pl-3 italic">
                                    {order.notes}
                                </p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
