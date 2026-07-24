import { getSalesDashboardStats } from '@/actions/dashboard/sales-dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatRupiah } from '@/lib/utils/utils';
import { salesLabels } from '@/lib/labels';
import Link from 'next/link';
import {
    FileText,
    Truck,
    CalendarDays,
    AlertTriangle,
    Plus,
    ArrowRight,
    Smartphone,
    TrendingUp,
    CreditCard,
    Package,
} from 'lucide-react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>

export default async function SalesCommandBoardPage(props: { searchParams: SearchParams }) {
    const searchParams = await props.searchParams;
    const from = typeof searchParams.from === 'string' ? new Date(searchParams.from) : undefined;
    const to = typeof searchParams.to === 'string' ? new Date(searchParams.to) : undefined;

    const dateRange = from && to ? { from, to } : undefined;
    const statsRes = await getSalesDashboardStats(dateRange);
    const board = statsRes.success && statsRes.data
        ? statsRes.data
        : {
            counts: {
                draftOrders: 0,
                readyToShipOrders: 0,
                openDeliveryOrders: 0,
                tripsToday: 0,
                overdueInvoices: 0,
                overdueAmount: 0,
                activeOrders: 0,
                activeCustomers: 0,
            },
            attention: {
                oldDrafts: [],
                readyWithoutDo: [],
                openDeliveries: [],
                overdueInvoices: [],
                creditRisk: [],
            },
            performance: {
                totalRevenue: 0,
                revenueDefinition: 'journal_4xx' as const,
                revenueTrend: [],
                totalOrders: 0,
            },
        };

    const { counts, attention, performance } = board;

    return (
        <div className="flex flex-col space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <PageHeader
                    title={salesLabels.salesDashboard}
                    description={salesLabels.salesDashboardDesc}
                />
            </div>

            {/* KPI Cards — operational snapshot (NOT date-bound) */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                <Link href="/sales/orders?status=DRAFT">
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">DRAFT SO</CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.draftOrders}</div>
                            <p className="text-xs text-muted-foreground">Perlu dikonfirmasi</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/sales/orders?status=READY_TO_SHIP">
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Siap SJ</CardTitle>
                            <Package className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.readyToShipOrders}</div>
                            <p className="text-xs text-muted-foreground">Siap dibuatkan SJ</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/sales/deliveries">
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">SJ Aktif</CardTitle>
                            <Truck className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.openDeliveryOrders}</div>
                            <p className="text-xs text-muted-foreground">PENDING + LOADING</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/sales/delivery-schedules">
                    <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Trip Hari Ini</CardTitle>
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{counts.tripsToday}</div>
                            <p className="text-xs text-muted-foreground">Jadwal berangkat</p>
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/sales/invoices?status=OVERDUE">
                    <Card className="hover:border-destructive/50 transition-colors cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
                            <AlertTriangle className="h-4 w-4 text-destructive" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-destructive">{counts.overdueInvoices}</div>
                            <p className="text-xs text-muted-foreground">
                                {counts.overdueAmount > 0 ? formatRupiah(counts.overdueAmount) : '-'}
                            </p>
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Butuh Perhatian — Attention Lists */}
            <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">Butuh Perhatian</h2>
                <p className="text-sm text-muted-foreground">Hal yang butuh tindakan segera.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* SO DRAFT > 0 hari */}
                {attention.oldDrafts.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                SO DRAFT ({attention.oldDrafts.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {attention.oldDrafts.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-sm">
                                    <div className="min-w-0">
                                        <Link href={`/sales/orders/${item.id}`} className="font-medium hover:underline truncate block">
                                            {item.orderNumber}
                                        </Link>
                                        <p className="text-xs text-muted-foreground truncate">{item.customerName}</p>
                                    </div>
                                    <Badge variant="outline" className="shrink-0 ml-2">{item.daysOld}h</Badge>
                                </div>
                            ))}
                            <Link href="/sales/orders?status=DRAFT" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                                Lihat semua <ArrowRight className="h-3 w-3" />
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* READY_TO_SHIP tanpa DO */}
                {attention.readyWithoutDo.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Siap tanpa SJ ({attention.readyWithoutDo.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {attention.readyWithoutDo.map((item) => (
                                <div key={item.id} className="text-sm">
                                    <Link href={`/sales/orders/${item.id}`} className="font-medium hover:underline">
                                        {item.orderNumber}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">{item.customerName}</p>
                                </div>
                            ))}
                            <Link href="/sales/orders?status=READY_TO_SHIP" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                                Lihat semua <ArrowRight className="h-3 w-3" />
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* SJ LOADING / PENDING */}
                {attention.openDeliveries.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Truck className="h-4 w-4" />
                                SJ Aktif ({attention.openDeliveries.length})
                                <Badge variant="secondary" className="text-[10px] ml-auto">Gudang eksekusi</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {attention.openDeliveries.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-sm">
                                    <div className="min-w-0">
                                        <Link href={`/sales/deliveries/${item.id}`} className="font-medium hover:underline truncate block">
                                            {item.deliveryNumber}
                                        </Link>
                                        <p className="text-xs text-muted-foreground truncate">{item.customerName ?? '-'}</p>
                                    </div>
                                    <Badge variant={item.status === 'LOADING' ? 'default' : 'outline'} className="shrink-0 ml-2">
                                        {item.status === 'LOADING' ? 'Muat' : 'Pending'}
                                    </Badge>
                                </div>
                            ))}
                            <Link href="/sales/deliveries" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                                Lihat semua <ArrowRight className="h-3 w-3" />
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* Invoice OVERDUE */}
                {attention.overdueInvoices.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                Overdue ({attention.overdueInvoices.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {attention.overdueInvoices.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-sm">
                                    <div className="min-w-0">
                                        {/* Sales has no invoice detail page — open related SO when known */}
                                        <Link
                                            href={item.salesOrderId ? `/sales/orders/${item.salesOrderId}` : '/sales/invoices?status=OVERDUE'}
                                            className="font-medium hover:underline truncate block"
                                        >
                                            {item.invoiceNumber}
                                        </Link>
                                        <p className="text-xs text-muted-foreground truncate">{item.customerName}</p>
                                    </div>
                                    <span className="text-xs font-medium text-destructive shrink-0 ml-2">
                                        {formatRupiah(item.remaining)}
                                    </span>
                                </div>
                            ))}
                            <Link href="/sales/invoices?status=OVERDUE" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                                Lihat semua <ArrowRight className="h-3 w-3" />
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* Credit Risk */}
                {attention.creditRisk.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <CreditCard className="h-4 w-4" />
                                Limit Kredit ({attention.creditRisk.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {attention.creditRisk.map((item) => (
                                <div key={item.id} className="flex items-center justify-between text-sm gap-2">
                                    <Link href={`/sales/customers/${item.id}`} className="font-medium truncate hover:underline">
                                        {item.name}
                                    </Link>
                                    <Badge variant={item.exposureStatus === 'over' ? 'destructive' : 'outline'} className="shrink-0">
                                        {item.exposureStatus === 'over' ? 'Over' : 'Mendekati'}
                                    </Badge>
                                </div>
                            ))}
                            <Link href="/sales/customers" className="text-xs text-primary hover:underline flex items-center gap-1 mt-2">
                                Lihat customer <ArrowRight className="h-3 w-3" />
                            </Link>
                        </CardContent>
                    </Card>
                )}

                {/* Empty state when no attention items */}
                {attention.oldDrafts.length === 0 &&
                 attention.readyWithoutDo.length === 0 &&
                 attention.openDeliveries.length === 0 &&
                 attention.overdueInvoices.length === 0 &&
                 attention.creditRisk.length === 0 && (
                    <Card className="md:col-span-2 lg:col-span-3">
                        <CardContent className="py-8 text-center text-muted-foreground">
                            <p>Tidak ada item yang butuh perhatian saat ini.</p>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3">
                <Link href="/sales/orders/create">
                    <Button size="sm">
                        <Plus className="h-4 w-4 mr-1" /> Order Baru
                    </Button>
                </Link>
                <Link href="/sales/quotations/create">
                    <Button size="sm" variant="outline">
                        <Plus className="h-4 w-4 mr-1" /> Penawaran
                    </Button>
                </Link>
                <Link href="/sales/delivery-schedules">
                    <Button size="sm" variant="outline">
                        <CalendarDays className="h-4 w-4 mr-1" /> Jadwal Kirim
                    </Button>
                </Link>
                <Link href="/field/sales">
                    <Button size="sm" variant="ghost">
                        <Smartphone className="h-4 w-4 mr-1" /> Mode Mobile
                    </Button>
                </Link>
            </div>

            {/* Ringkas Performa — collapsible / secondary */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Ringkas Performa
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">Omzet Periode</p>
                            <p className="font-semibold">{formatRupiah(performance.totalRevenue)}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Order Aktif</p>
                            <p className="font-semibold">{counts.activeOrders}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Customer Aktif</p>
                            <p className="font-semibold">{counts.activeCustomers}</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">Definisi</p>
                            <p className="font-semibold text-xs" title="Omzet = total jurnal pendapatan (akun 4*) yang sudah POSTED pada periode ini. Berbeda dengan total SO non-batal.">Jurnal akun 4*</p>
                        </div>
                    </div>
                    <div className="mt-3">
                        <Link href="/sales/reports/sales-performance" className="text-xs text-primary hover:underline flex items-center gap-1">
                            Performa lengkap <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
