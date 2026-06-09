'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    getDailyPettyCashReportAction,
    createPettyCashDailyReportAction,
    markPettyCashDailyReportReadyToPrintAction,
    confirmPettyCashDailyReportPhysicalSignatureAction,
    finalizePettyCashDailyReportAction,
    voidPettyCashDailyReportAction
} from '@/actions/finance/petty-cash-report-actions';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils/utils';
import { Button } from '@/components/ui/button';
import { RotateCw, Printer, CalendarIcon, Wallet, ArrowDownRight, ArrowUpRight, CheckCircle, Clock } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils/utils";
import { format } from "date-fns";

interface Transaction {
    id: string;
    voucherNumber: string;
    date: string;
    description: string;
    amount: number | string;
    type: string;
    status: string;
    expenseAccount?: { name: string, code: string } | null;
    createdBy: { name: string };
}

interface ReportData {
    date: string;
    openingBalance: number;
    totalIn: number;
    totalOut: number;
    closingBalance: number;
    transactions: Transaction[];
    savedReport: { id: string; reportNumber?: string; status?: string } | null;
    status: string | null;
}

export default function DailyPettyCashReportPage() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [date, setDate] = useState<Date>(new Date());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // ISO date string format YYYY-MM-DD
            const dateStr = format(date, "yyyy-MM-dd");
            const result = await getDailyPettyCashReportAction(dateStr);
            if (result && 'success' in result && result.success) {
                // Preserve raw report for status handling
                setData(result.data as unknown as ReportData);
            } else {
                console.error("Failed to load report data:", result && 'error' in result ? result.error : 'Unknown error');
                setData(null);
            }
        } catch (error) {
            console.error("Failed to load report data", error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handlePrint = () => {
        window.print();
    };

    const runReportAction = async (action: (reportId: string) => Promise<unknown>) => {
        const reportId = data?.savedReport?.id;
        if (!reportId) return;

        setActionLoading(true);
        try {
            await action(reportId);
            await fetchData();
        } catch (error) {
            console.error(error);
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            {/* Global style overrides to hide layout sidebar, header and spacing when printing */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    aside,
                    header,
                    .h-16.lg\\:hidden,
                    .print\\:hidden,
                    button,
                    .no-print {
                        display: none !important;
                    }
                    main,
                    .lg\\:ml-64,
                    .p-4,
                    .md\\:p-6,
                    .lg\\:p-8 {
                        margin-left: 0 !important;
                        padding: 0 !important;
                    }
                    body, html {
                        background-color: white !important;
                        color: black !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-report-container {
                        border: none !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }
            `}} />

            {/* Top Navigation & Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Daily Petty Cash Report</h1>
                    <p className="text-muted-foreground">
                        Harian Kas Kecil untuk tanggal {format(date, "PPP")}
                    </p>
                </div>
                <div className="flex gap-2 items-center">
                    {/* Date Picker */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn(
                                    "w-[240px] justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP") : <span>Pilih tanggal</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => d && setDate(d)}
                                captionLayout="dropdown"
                                fromYear={2000}
                                toYear={new Date().getFullYear() + 1}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    <Button variant="outline" size="icon" onClick={fetchData} title="Refresh data">
                        <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                    {/* Action Buttons */}
                    {data && (
                        <div className="flex gap-2">
                            {/* Create Report */}
                            {data.savedReport === null && (
                                <Button
                                    variant="default"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={async () => {
                                        setActionLoading(true);
                                        try {
                                            const result = await createPettyCashDailyReportAction(format(date, "yyyy-MM-dd"));
                                            if (result && 'success' in result && result.success) {
                                                await fetchData();
                                            } else {
                                                console.error('Create report failed', result);
                                            }
                                        } catch (e) {
                                            console.error(e);
                                        } finally {
                                            setActionLoading(false);
                                        }
                                    }}
                                    disabled={actionLoading}
                                >
                                    Buat Laporan
                                </Button>
                            )}
                            {/* Mark Ready to Print */}
                            {data.savedReport && data.status === 'DRAFT' && (
                                <Button
                                    variant="default"
                                    onClick={() => runReportAction(markPettyCashDailyReportReadyToPrintAction)}
                                    disabled={actionLoading}
                                >
                                    Siap Cetak
                                </Button>
                            )}
                            {/* Confirm physical signature */}
                            {data.savedReport && data.status === 'READY_TO_PRINT' && (
                                <Button
                                    variant="default"
                                    onClick={() => runReportAction(confirmPettyCashDailyReportPhysicalSignatureAction)}
                                    disabled={actionLoading}
                                >
                                    Tandai Sudah TTD Basah
                                </Button>
                            )}
                            {/* Finalize */}
                            {data.savedReport && data.status === 'SIGNED_PHYSICAL' && (
                                <Button
                                    variant="default"
                                    onClick={() => runReportAction(finalizePettyCashDailyReportAction)}
                                    disabled={actionLoading}
                                >
                                    Finalisasi Arsip
                                </Button>
                            )}
                            {/* Void */}
                            {data.savedReport && data.status !== 'FINALIZED' && data.status !== 'VOIDED' && (
                                <Button
                                    variant="destructive"
                                    onClick={async () => {
                                        const reportId = data.savedReport?.id;
                                        if (!reportId) return;
                                        if (!confirm('Apakah anda yakin ingin void laporan ini?')) return;
                                        setActionLoading(true);
                                        try {
                                            const res = await voidPettyCashDailyReportAction(reportId);
                                            if (res && 'success' in res && res.success) await fetchData();
                                        } catch (e) { console.error(e); }
                                        finally { setActionLoading(false); }
                                    }}
                                    disabled={actionLoading}
                                >
                                    Void
                                </Button>
                            )}
                        </div>
                    )}
                    <Button variant="default" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePrint} disabled={loading || !data}>
                        <Printer className="h-4 w-4" />
                        Cetak Laporan
                    </Button>
                </div>
            </div>

            {/* Print Only Header (Invisible in screen mode, visible in print mode) */}
            <div className="hidden print:block border-b-2 border-black pb-4 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold tracking-wider">POLYFLOW MANUFACTURING</h2>
                        <p className="text-xs text-gray-600">Sistem ERP Internal Finance</p>
                    </div>
                    <div className="text-right">
                        <h1 className="text-xl font-bold text-gray-800">LAPORAN KAS KECIL HARIAN</h1>
                        <p className="text-sm font-mono mt-1">Tanggal: {format(date, "dd MMMM yyyy")}</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center text-muted-foreground text-sm flex justify-center items-center gap-2">
                    <RotateCw className="h-5 w-5 animate-spin text-purple-600" />
                    Sedang memuat data laporan...
                </div>
            ) : !data ? (
                <div className="py-20 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                    Gagal memuat data laporan untuk tanggal ini. Silakan coba lagi.
                </div>
            ) : (
                <div className="space-y-6 print-report-container">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 print:grid-cols-4 print:gap-4">
                        <Card className="shadow-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Saldo Awal</CardTitle>
                                <Wallet className="h-4 w-4 text-muted-foreground print:hidden" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono tracking-tight text-gray-800">
                                    {formatRupiah(data.openingBalance)}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Saldo dari periode sebelum hari ini
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-emerald-100 bg-emerald-50/20 print:bg-white print:border-border">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-emerald-800 print:text-card-foreground">Total Kas Masuk</CardTitle>
                                <ArrowUpRight className="h-4 w-4 text-emerald-600 print:hidden" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono tracking-tight text-emerald-700 print:text-card-foreground">
                                    {formatRupiah(data.totalIn)}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Total replenishment terposting hari ini
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm border-rose-100 bg-rose-50/20 print:bg-white print:border-border">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-rose-800 print:text-card-foreground">Total Kas Keluar</CardTitle>
                                <ArrowDownRight className="h-4 w-4 text-rose-600 print:hidden" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono tracking-tight text-rose-700 print:text-card-foreground">
                                    {formatRupiah(data.totalOut)}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Total pengeluaran terposting hari ini
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="shadow-sm bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border-purple-200 print:bg-white print:border-border">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium text-purple-900 print:text-card-foreground">Saldo Akhir</CardTitle>
                                <Wallet className="h-4 w-4 text-purple-600 print:hidden" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold font-mono tracking-tight text-purple-700 print:text-card-foreground">
                                    {formatRupiah(data.closingBalance)}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                    Total sisa kas akhir terposting hari ini
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Transactions List */}
                    <Card className="shadow-sm">
                        <CardHeader className="print:pb-2">
                            <CardTitle className="text-lg font-semibold flex items-center gap-2">
                                Daftar Voucher Kas Kecil
                                <span className="text-xs font-normal text-muted-foreground font-mono bg-muted px-2 py-0.5 rounded">
                                    {data.transactions.length} transaksi
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-md border overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-muted/30">
                                            <TableHead className="w-[120px]">No Voucher</TableHead>
                                            <TableHead className="w-[100px]">Jenis</TableHead>
                                            <TableHead>Deskripsi</TableHead>
                                            <TableHead>Akun Biaya</TableHead>
                                            <TableHead className="text-right w-[140px]">Kas Masuk</TableHead>
                                            <TableHead className="text-right w-[140px]">Kas Keluar</TableHead>
                                            <TableHead className="w-[100px] text-center">Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.transactions.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                                                    Tidak ada transaksi kas kecil tercatat pada tanggal ini.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.transactions.map((t) => (
                                                <TableRow key={t.id} className="hover:bg-muted/10 print:hover:bg-white">
                                                    <TableCell className="font-mono text-xs font-semibold">{t.voucherNumber}</TableCell>
                                                    <TableCell>
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider print:border print:bg-white",
                                                            t.type === 'EXPENSE' 
                                                                ? 'bg-rose-100 text-rose-800 border-rose-200' 
                                                                : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                                        )}>
                                                            {t.type === 'EXPENSE' ? 'Keluar' : 'Masuk'}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="max-w-[250px] truncate" title={t.description}>
                                                        <div className="font-medium text-xs">{t.description}</div>
                                                        <div className="text-[10px] text-muted-foreground">Dibuat oleh: {t.createdBy?.name || 'N/A'}</div>
                                                    </TableCell>
                                                    <TableCell className="text-xs">
                                                        {t.expenseAccount ? (
                                                            <span>
                                                                <span className="font-mono text-[11px] font-semibold text-gray-700 bg-gray-100 px-1 py-0.5 rounded mr-1">
                                                                    {t.expenseAccount.code}
                                                                </span>
                                                                <span className="text-gray-600">{t.expenseAccount.name}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-medium text-xs">
                                                        {t.type === 'REPLENISHMENT' ? formatRupiah(Number(t.amount)) : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono font-medium text-xs">
                                                        {t.type === 'EXPENSE' ? formatRupiah(Number(t.amount)) : '—'}
                                                    </TableCell>
                                                    <TableCell className="text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            {t.status === 'POSTED' ? (
                                                                <>
                                                                    <CheckCircle className="h-3 w-3 text-emerald-600 print:hidden" />
                                                                    <span className="text-[10px] font-semibold text-emerald-800 uppercase print:text-black">Posted</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Clock className="h-3 w-3 text-amber-500 print:hidden" />
                                                                    <span className="text-[10px] font-semibold text-amber-800 uppercase print:text-black">Draft</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                        {/* Reconciliation Summary Line for Printing */}
                                        <TableRow className="bg-muted/10 font-bold border-t-2">
                                            <TableCell colSpan={4} className="text-right text-xs">TOTAL HARIAN TERPOSTING</TableCell>
                                            <TableCell className="text-right font-mono text-xs text-emerald-700 print:text-black">
                                                {formatRupiah(data.totalIn)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-xs text-rose-700 print:text-black">
                                                {formatRupiah(data.totalOut)}
                                            </TableCell>
                                            <TableCell className="bg-muted/20"></TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Manual Signature Section for Audit Signoff */}
                    <div className="mt-10 pt-4 border-t border-dashed border-gray-300 print:border-none print:mt-12">
                        <p className="text-xs text-muted-foreground mb-4 text-center print:text-left print:mb-6">
                            Laporan kas kecil harian ini dicetak secara otomatis dari sistem ERP PolyFlow.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center text-xs print:grid-cols-3 print:gap-4 print:text-left">
                            <div className="space-y-16">
                                <div className="space-y-1">
                                    <p className="font-semibold text-gray-700">Dibuat Oleh,</p>
                                    <p className="text-[10px] text-muted-foreground">Bagian Finance / Kasir</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold underline">( ___________________________ )</p>
                                    <p className="text-[10px] text-muted-foreground">Tanggal: ____ / ____ / ________</p>
                                </div>
                            </div>

                            <div className="space-y-16">
                                <div className="space-y-1">
                                    <p className="font-semibold text-gray-700">Disetujui Oleh,</p>
                                    <p className="text-[10px] text-muted-foreground">Direktur Operasional</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold underline">( ___________________________ )</p>
                                    <p className="text-[10px] text-muted-foreground">Tanggal: ____ / ____ / ________</p>
                                </div>
                            </div>

                            <div className="space-y-16">
                                <div className="space-y-1">
                                    <p className="font-semibold text-gray-700">Mengetahui,</p>
                                    <p className="text-[10px] text-muted-foreground">Komisaris / Pengawas</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="font-semibold underline">( ___________________________ )</p>
                                    <p className="text-[10px] text-muted-foreground">Tanggal: ____ / ____ / ________</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
