'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTaxSummary } from '@/actions/finance/tax-actions';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { formatRupiah } from '@/lib/utils/utils';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { id } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCw, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TaxSummaryData {
    vatOutputBalance: number;
    vatInputBalance: number;
    netVatPayable: number;
    incomeTaxPayable: number;
}

export default function TaxReportPage() {
    const [data, setData] = useState<TaxSummaryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const startDate = startOfMonth(date);
            const endDate = endOfMonth(date);

            const report = await getTaxSummary(startDate, endDate);
            if (report.success) {
                setData(report.data as unknown as TaxSummaryData);
            }
        } catch (error) {
            console.error("Failed to load tax report", error);
        } finally {
            setLoading(false);
        }
    }, [date]);

    const handlePrevMonth = () => setDate(prev => subMonths(prev, 1));
    const handleNextMonth = () => setDate(prev => addMonths(prev, 1));
    const handleCurrentMonth = () => setDate(new Date());

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Laporan Pajak Bulanan</h1>
                    <p className="text-muted-foreground">
                        Ringkasan PPN Keluaran, PPN Masukan, dan PPh 21 Terutang untuk periode {format(date, "MMMM yyyy", { locale: id })}.
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    <div className="flex items-center border rounded-md bg-background">
                        <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="w-40 text-center font-medium">
                            {format(date, "MMMM yyyy", { locale: id })}
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                    <Button variant="outline" onClick={handleCurrentMonth}>
                        Bulan Ini
                    </Button>
                    <Button variant="outline" size="icon" onClick={fetchData}>
                        <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : data ? (
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Value Added Tax (PPN) Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-indigo-500" />
                                Pajak Pertambahan Nilai (PPN)
                            </CardTitle>
                            <CardDescription>
                                Ringkasan pajak masukan dan keluaran PPN
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center border-b pb-4">
                                <div>
                                    <p className="font-medium">PPN Keluaran (VAT Output)</p>
                                    <p className="text-sm text-muted-foreground">Pajak yang dipungut dari penjualan</p>
                                </div>
                                <div className="text-lg font-mono">{formatRupiah(Math.max(0, data.vatOutputBalance))}</div>
                            </div>
                            <div className="flex justify-between items-center border-b pb-4">
                                <div>
                                    <p className="font-medium">PPN Masukan (VAT Input)</p>
                                    <p className="text-sm text-muted-foreground">Pajak yang dibayarkan dari pembelian</p>
                                </div>
                                <div className="text-lg font-mono">({formatRupiah(Math.abs(data.vatInputBalance))})</div>
                            </div>
                            <div className="flex justify-between items-center pt-2">
                                <div>
                                    <p className="font-bold text-lg">Net PPN Terutang</p>
                                    <p className="text-sm text-muted-foreground">
                                        {data.netVatPayable > 0 ? 'Pajak Kurang Bayar (Payable)' : 'Pajak Lebih Bayar (Refundable)'}
                                    </p>
                                </div>
                                <div className={`text-2xl font-bold ${data.netVatPayable > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                                    {formatRupiah(Math.abs(data.netVatPayable))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Income Tax (PPh) Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-amber-500" />
                                Pajak Penghasilan (PPh)
                            </CardTitle>
                            <CardDescription>
                                Ringkasan kewajiban PPh 21
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex justify-between items-center border-b pb-4">
                                <div>
                                    <p className="font-medium">PPh 21 Karyawan Terutang</p>
                                    <p className="text-sm text-muted-foreground">Pajak penghasilan yang dipotong dari gaji</p>
                                </div>
                                <div className="text-lg font-mono">{formatRupiah(Math.max(0, data.incomeTaxPayable))}</div>
                            </div>
                            
                            <div className="flex justify-between items-center pt-2 opacity-50">
                                <div>
                                    <p className="font-medium">PPh 23 Terutang (Coming Soon)</p>
                                    <p className="text-sm text-muted-foreground">Pajak pemotongan atas jasa</p>
                                </div>
                                <div className="text-lg font-mono">Rp 0</div>
                            </div>

                            <div className="flex justify-between items-center pt-8">
                                <div>
                                    <p className="font-bold text-lg">Total PPh Terutang</p>
                                </div>
                                <div className="text-2xl font-bold text-destructive">
                                    {formatRupiah(Math.max(0, data.incomeTaxPayable))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : (
                <div className="text-center py-12 text-muted-foreground">
                    Tidak ada data pajak untuk periode ini.
                </div>
            )}
        </div>
    );
}
