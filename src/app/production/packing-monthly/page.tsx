import { PackingReportService } from '@/services/production/packing-report-service';
import { formatRupiah } from '@/lib/utils/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileText, Archive, TrendingUp, DollarSign, ListTodo } from 'lucide-react';
import { MonthPicker } from './MonthPicker';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ month?: string }>;
}

export default async function PackingMonthlyReportPage({ searchParams }: PageProps) {
    const params = await searchParams;
    
    // Default to current month (YYYY-MM) in local time
    const today = new Date();
    const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const selectedMonth = params.month || defaultMonth;

    const data = await PackingReportService.getMonthlyPackingReport(selectedMonth);

    // Calculate aggregated metrics
    const totalQuantity = data.reduce((sum, item) => sum + item.totalQuantity, 0);
    const totalCost = data.reduce((sum, item) => sum + item.totalCost, 0);
    const totalWOs = data.reduce((sum, item) => sum + item.workOrderCount, 0);
    const totalKarungConsumed = data.reduce((sum, item) => sum + item.karungConsumed, 0);
    const totalKarungCost = data.reduce((sum, item) => sum + item.karungCost, 0);
    const averageHpp = totalQuantity > 0 ? totalCost / totalQuantity : 0;

    // Format display for month (e.g. June 2026)
    const [year, month] = selectedMonth.split('-');
    const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleString('id-ID', {
        month: 'long',
        year: 'numeric'
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Laporan Produksi Packing</h1>
                    <p className="text-muted-foreground text-sm">
                        Laporan total hasil produksi barang jadi dan HPP dari Packing Area untuk periode {monthName}.
                    </p>
                </div>
                <div className="flex items-center gap-3 self-end md:self-auto">
                    <MonthPicker defaultValue={selectedMonth} />
                    <Button variant="outline" size="sm" className="border-zinc-200 dark:border-zinc-800">
                        <FileText className="mr-2 h-4 w-4 text-emerald-600" />
                        Ekspor
                    </Button>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">Total Produksi</p>
                                <h3 className="text-2xl font-bold text-foreground mt-1">{totalQuantity.toLocaleString('id-ID')}</h3>
                            </div>
                            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl">
                                <Archive className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">Avg HPP / Unit</p>
                                <h3 className="text-2xl font-bold text-foreground mt-1">{formatRupiah(averageHpp)}</h3>
                            </div>
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl">
                                <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">Total Nilai Produksi</p>
                                <h3 className="text-2xl font-bold text-foreground mt-1">{formatRupiah(totalCost)}</h3>
                            </div>
                            <div className="p-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl">
                                <DollarSign className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">Karung Terpakai</p>
                                <h3 className="text-2xl font-bold text-foreground mt-1">{totalKarungConsumed.toLocaleString('id-ID')}</h3>
                            </div>
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl">
                                <ListTodo className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">Biaya Karung</p>
                                <h3 className="text-2xl font-bold text-foreground mt-1">{formatRupiah(totalKarungCost)}</h3>
                            </div>
                            <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-xl">
                                <DollarSign className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/75">Total SPK Selesai</p>
                                <h3 className="text-2xl font-bold text-foreground mt-1">{totalWOs} SPK</h3>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-950/30 rounded-xl">
                                <ListTodo className="h-6 w-6 text-slate-600 dark:text-slate-400" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Main Data Table */}
            <Card className="border-zinc-200 dark:border-zinc-800 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-bold">Rincian Hasil Packing</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Akumulasi hasil produksi, karung terpakai, dan HPP per varian barang jadi.</p>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-zinc-50 dark:bg-zinc-900/50">
                                <TableRow>
                                    <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">Nama Produk</TableHead>
                                    <TableHead className="font-semibold text-zinc-700 dark:text-zinc-300">SKU</TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">Total Qty</TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">Jumlah SPK</TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">Karung</TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">Biaya Karung</TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">Rata-rata HPP</TableHead>
                                    <TableHead className="text-right font-semibold text-zinc-700 dark:text-zinc-300">Total Biaya</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground italic">
                                            Tidak ada data hasil produksi packing pada periode {monthName}.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    data.map((item) => (
                                        <TableRow key={item.productVariantId} className="hover:bg-zinc-50/55 dark:hover:bg-zinc-900/30">
                                            <TableCell className="font-medium text-sm text-foreground">
                                                {item.productName}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                                {item.skuCode}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-sm text-foreground">
                                                {item.totalQuantity.toLocaleString('id-ID')}
                                                <span className="text-[10px] ml-1 text-muted-foreground font-normal uppercase">{item.primaryUnit}</span>
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-muted-foreground">
                                                {item.workOrderCount}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-foreground">
                                                {item.karungConsumed.toLocaleString('id-ID')}
                                            </TableCell>
                                            <TableCell className="text-right text-sm text-foreground">
                                                {formatRupiah(item.karungCost)}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Badge variant="outline" className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
                                                    {formatRupiah(item.averageHpp)}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-sm text-foreground">
                                                {formatRupiah(item.totalCost)}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
