'use client';

import { useState } from 'react';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
    Users,
    UserPlus,
    UserMinus,
    AlertTriangle,
} from 'lucide-react';

type DormantCustomer = {
    customerId: string;
    customerName: string;
    lastOrderDate: string | null;
    lastVisitDate: string | null;
    isAlsoNotVisited: boolean;
    orderCount: number;
};

type NewCustomer = {
    customerId: string;
    customerName: string;
    createdAt: string;
};

type LostCustomer = {
    customerId: string;
    customerName: string;
    lastOrderDate: string | null;
    previousOrderCount: number;
};

type Summary = {
    dormantCount: number;
    newCount: number;
    lostCount: number;
    totalCustomersInScope: number;
};

type CustomerActivityData = {
    startDate: string | Date;
    endDate: string | Date;
    dormantThresholdDays: number;
    summary: Summary;
    dormantCustomers: DormantCustomer[];
    newCustomers: NewCustomer[];
    lostCustomers: LostCustomer[];
};

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return format(new Date(dateStr), 'd MMM yyyy', { locale: idLocale });
}

export function CustomerActivityReportClient({
    data,
}: {
    data: CustomerActivityData;
}) {
    const [activeTab, setActiveTab] = useState<
        'summary' | 'dormant' | 'new' | 'lost'
    >('summary');

    const summary = data.summary;

    return (
        <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-800/50 dark:bg-amber-950/10">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            Customer Dormant
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Tanpa order &gt;{data.dormantThresholdDays} hari
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {summary.dormantCount}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            dari {summary.totalCustomersInScope} customer aktif
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-emerald-600" />
                            Customer Baru
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Baru terdaftar di periode ini
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {summary.newCount}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <UserMinus className="h-4 w-4 text-red-600" />
                            Customer Hilang
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Ada order periode lalu, nihil periode ini
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {summary.lostCount}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-600" />
                            Total di Scope
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Customer aktif di portofolio Anda
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-xl font-bold">
                            {summary.totalCustomersInScope}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(v) =>
                    setActiveTab(v as 'summary' | 'dormant' | 'new' | 'lost')
                }
            >
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="summary">Ringkasan</TabsTrigger>
                    <TabsTrigger value="dormant">
                        <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                        Dormant ({summary.dormantCount})
                    </TabsTrigger>
                    <TabsTrigger value="new">
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        Baru ({summary.newCount})
                    </TabsTrigger>
                    <TabsTrigger value="lost">
                        <UserMinus className="h-3.5 w-3.5 mr-1.5" />
                        Hilang ({summary.lostCount})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Catatan Metodologi
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>
                                • <strong>Dormant:</strong> customer{' '}
                                <code>isActive=true</code> dengan order terakhir
                                (status ≠ CANCELLED) lebih lama dari{' '}
                                {data.dormantThresholdDays} hari dari sekarang,
                                atau tidak pernah order sama sekali.
                            </p>
                            <p>
                                • <strong>Customer baru:</strong>{' '}
                                <code>Customer.createdAt</code> dalam rentang
                                periode laporan.
                            </p>
                            <p>
                                • <strong>Customer hilang:</strong> ada SO
                                (non-CANCELLED) di periode sebelumnya tapi nihil
                                di periode ini.
                            </p>
                            <p>
                                • <strong>isAlsoNotVisited:</strong> customer
                                dormant yang juga tidak dikunjungi (lastVisitDate
                                null atau lebih lama dari threshold) =
                                <strong> daftar prioritas paling actionable</strong>.
                            </p>
                            <p>
                                • <strong>Guard:</strong> laporan ini untuk ADMIN,
                                SALES, MARKETING. Sales biasa cuma lihat
                                portofolionya.
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="dormant">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Customer Dormant
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Diurutkan: tidak dikunjungi dulu, lalu order
                                terlama
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-right">
                                                Total Order
                                            </TableHead>
                                            <TableHead>
                                                Order Terakhir
                                            </TableHead>
                                            <TableHead>
                                                Kunjungan Terakhir
                                            </TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.dormantCustomers.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={5}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada customer dormant.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.dormantCustomers.map(
                                                (row) => (
                                                    <TableRow
                                                        key={row.customerId}
                                                        className={
                                                            row.isAlsoNotVisited
                                                                ? 'bg-red-50/50 dark:bg-red-950/10'
                                                                : ''
                                                        }
                                                    >
                                                        <TableCell className="font-medium">
                                                            {row.customerName}
                                                        </TableCell>
                                                        <TableCell className="text-right tabular-nums">
                                                            {row.orderCount}
                                                        </TableCell>
                                                        <TableCell>
                                                            {formatDate(
                                                                row.lastOrderDate,
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {formatDate(
                                                                row.lastVisitDate,
                                                            )}
                                                        </TableCell>
                                                        <TableCell>
                                                            {row.isAlsoNotVisited ? (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-300 dark:border-red-800/50 text-[11px]"
                                                                >
                                                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                                                    Belum
                                                                    dikunjungi
                                                                </Badge>
                                                            ) : (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="text-[11px]"
                                                                >
                                                                    Sudah
                                                                    dikunjungi
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ),
                                            )
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="new">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Customer Baru
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Customer yang baru terdaftar di periode ini
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead>Tanggal Daftar</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.newCustomers.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={2}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada customer baru di
                                                    periode ini.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.newCustomers.map((row) => (
                                                <TableRow
                                                    key={row.customerId}
                                                >
                                                    <TableCell className="font-medium">
                                                        {row.customerName}
                                                    </TableCell>
                                                    <TableCell>
                                                        {formatDate(
                                                            row.createdAt,
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="lost">
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">
                                Customer Hilang
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Ada order di periode lalu, tapi nihil di periode
                                ini
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Customer</TableHead>
                                            <TableHead className="text-right">
                                                Order Periode Lalu
                                            </TableHead>
                                            <TableHead>
                                                Order Terakhir
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.lostCustomers.length === 0 ? (
                                            <TableRow>
                                                <TableCell
                                                    colSpan={3}
                                                    className="text-center text-muted-foreground py-8"
                                                >
                                                    Tidak ada customer hilang.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.lostCustomers.map((row) => (
                                                <TableRow
                                                    key={row.customerId}
                                                >
                                                    <TableCell className="font-medium">
                                                        {row.customerName}
                                                    </TableCell>
                                                    <TableCell className="text-right tabular-nums">
                                                        {
                                                            row.previousOrderCount
                                                        }
                                                    </TableCell>
                                                    <TableCell>
                                                        {formatDate(
                                                            row.lastOrderDate,
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
