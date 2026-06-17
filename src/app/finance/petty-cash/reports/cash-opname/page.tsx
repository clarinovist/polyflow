'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    getDailyPettyCashReportAction,
} from '@/actions/finance/petty-cash-report-actions';
import { Button } from '@/components/ui/button';
import { RotateCw, Printer, CalendarIcon } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/utils";
import { format, subDays } from "date-fns";
import { id as localeID } from "date-fns/locale";

interface Transaction {
    id: string;
    voucherNumber: string;
    date: string;
    description: string;
    amount: number | string;
    type: string;
    status: string;
    expenseAccount?: { name: string; code: string } | null;
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

// Denomination presets (Rupiah)
const DENOMINATIONS = [
    { value: 100000, label: '100.000' },
    { value: 75000, label: '75.000' },
    { value: 50000, label: '50.000' },
    { value: 20000, label: '20.000' },
    { value: 10000, label: '10.000' },
    { value: 5000, label: '5.000' },
    { value: 2000, label: '2.000' },
    { value: 1000, label: '1.000', type: 'Kertas' },
    { value: 1000, label: '1.000', type: 'Koin' },
    { value: 500, label: '500' },
    { value: 200, label: '200' },
    { value: 100, label: '100' },
];

function formatNumber(n: number): string {
    return n.toLocaleString('id-ID').replace(/,/g, '.');
}

export default function CashOpnamePage() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());
    const [denominations, setDenominations] = useState<number[]>(
        new Array(DENOMINATIONS.length).fill(0)
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const dateStr = format(date, "yyyy-MM-dd");
            const result = await getDailyPettyCashReportAction(dateStr);
            if (result && 'success' in result && result.success) {
                setData(result.data as unknown as ReportData);
            } else {
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

    const updateDenomination = (index: number, count: number) => {
        const updated = [...denominations];
        updated[index] = Math.max(0, count);
        setDenominations(updated);
    };

    // Calculate denomination totals
    const denominationRows = DENOMINATIONS.map((d, i) => ({
        ...d,
        count: denominations[i],
        total: d.value * denominations[i],
    }));
    const totalFisik = denominationRows.reduce((sum, r) => sum + r.total, 0);

    // Financial calculations
    const openingBalance = data?.openingBalance ?? 0;
    const totalOut = data?.totalOut ?? 0;
    const totalIn = data?.totalIn ?? 0;
    const closingBalance = data?.closingBalance ?? 0;
    const selisih = totalFisik - closingBalance;

    // Previous day for opening balance date
    const prevDate = subDays(date, 1);

    const dayName = format(date, 'EEEE', { locale: localeID });
    const dateFormatted = format(date, 'd MMMM yyyy', { locale: localeID });

    return (
        <>
            {/* Print styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    aside, header, .h-16.lg\\:hidden, .print\\:hidden, button, .no-print, nav {
                        display: none !important;
                    }
                    main, .lg\\:ml-64, .p-4, .md\\:p-6, .lg\\:p-8 {
                        margin-left: 0 !important;
                        padding: 0 !important;
                    }
                    body, html {
                        background-color: white !important;
                        color: black !important;
                        font-size: 11px !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-container {
                        border: none !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        max-width: 100% !important;
                    }
                    input[type="number"] {
                        border: none !important;
                        padding: 0 !important;
                        font-size: 11px !important;
                    }
                }
            `}} />

            {/* Controls (hidden on print) */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Berita Acara Cash Opname</h1>
                    <p className="text-muted-foreground">Cetak berita acara kas kecil harian</p>
                </div>
                <div className="flex gap-2 items-center">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                className={cn("w-[240px] justify-start text-left font-normal", !date && "text-muted-foreground")}
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
                    <Button variant="outline" size="icon" onClick={fetchData} title="Refresh">
                        <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
                    </Button>
                    <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePrint} disabled={loading || !data}>
                        <Printer className="h-4 w-4" />
                        Cetak
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center text-muted-foreground flex justify-center items-center gap-2">
                    <RotateCw className="h-5 w-5 animate-spin" /> Memuat data...
                </div>
            ) : !data ? (
                <div className="py-20 text-center border-2 border-dashed rounded-lg text-muted-foreground">
                    Tidak ada data untuk tanggal ini.
                </div>
            ) : (
                <div className="print-container max-w-4xl mx-auto bg-white p-8 border rounded-lg">
                    {/* ===== HEADER ===== */}
                    <div className="text-center mb-2">
                        <h1 className="text-xl font-bold tracking-wide">BERITA ACARA</h1>
                        <p className="text-sm">Cash Opname : 1-112 Kas Kecil</p>
                        <p className="text-sm">Tanggal : {dayName}, {dateFormatted}</p>
                    </div>
                    <hr className="border-black mb-4" />

                    {/* ===== OPENING BALANCE & SUMMARY ===== */}
                    <div className="space-y-1 text-sm mb-4">
                        <div className="flex justify-between">
                            <span>Saldo Awal tgl {format(prevDate, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span className="font-mono">{formatNumber(openingBalance)}</span>
                        </div>
                        <div className="font-semibold">KAS KECIL</div>
                        <div className="flex justify-between">
                            <span>Pengeluaran yg bernota tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span className="font-mono">{formatNumber(totalOut)}</span>
                        </div>
                        <div>sampai tgl</div>
                        <div className="flex justify-between">
                            <span>KAS BON s/d tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span>&nbsp;</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Uang Masuk Kas Kecil tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span className="font-mono">{formatNumber(totalIn)}</span>
                        </div>
                    </div>

                    {/* ===== TRANSACTION TABLE ===== */}
                    <div className="mb-4">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border border-black">
                                    <th className="border border-black px-2 py-1 text-left w-24">Tanggal</th>
                                    <th className="border border-black px-2 py-1 text-left">No Inv/No Po</th>
                                    <th className="border border-black px-2 py-1 text-left">Nomor Transaksi</th>
                                    <th className="border border-black px-2 py-1 text-left">Memo</th>
                                    <th className="border border-black px-2 py-1 text-right w-32">Pengembalian Kasbon</th>
                                    <th className="border border-black px-2 py-1 text-right w-32">Pengeluaran Kasbon</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.transactions.filter(t => t.status === 'POSTED').map((t) => (
                                    <tr key={t.id} className="border border-black">
                                        <td className="border border-black px-2 py-1">
                                            {format(new Date(t.date), 'd MMM yyyy', { locale: localeID })}
                                        </td>
                                        <td className="border border-black px-2 py-1 text-xs">
                                            {t.type === 'EXPENSE' ? `1117-MELINDO JAY/BKM-${format(new Date(t.date), 'dd/MM/yy')}` : ''}
                                        </td>
                                        <td className="border border-black px-2 py-1 font-mono text-xs">
                                            {t.voucherNumber}
                                        </td>
                                        <td className="border border-black px-2 py-1">
                                            {t.description}
                                        </td>
                                        <td className="border border-black px-2 py-1 text-right font-mono">
                                            {t.type === 'REPLENISHMENT' ? formatNumber(Number(t.amount)) : ''}
                                        </td>
                                        <td className="border border-black px-2 py-1 text-right font-mono">
                                            {t.type === 'EXPENSE' ? formatNumber(Number(t.amount)) : ''}
                                        </td>
                                    </tr>
                                ))}
                                {data.transactions.filter(t => t.status === 'POSTED').length === 0 && (
                                    <tr className="border border-black">
                                        <td colSpan={6} className="border border-black px-2 py-2 text-center text-muted-foreground italic">
                                            Tidak ada transaksi terposting
                                        </td>
                                    </tr>
                                )}
                                {/* Total row */}
                                <tr className="border border-black font-bold">
                                    <td colSpan={4} className="border border-black px-2 py-1 text-right">TOTAL KASBON :</td>
                                    <td className="border border-black px-2 py-1 text-right font-mono">
                                        {formatNumber(data.transactions.filter(t => t.type === 'REPLENISHMENT' && t.status === 'POSTED').reduce((s, t) => s + Number(t.amount), 0))}
                                    </td>
                                    <td className="border border-black px-2 py-1 text-right font-mono">
                                        {formatNumber(data.transactions.filter(t => t.type === 'EXPENSE' && t.status === 'POSTED').reduce((s, t) => s + Number(t.amount), 0))}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* ===== FINANCIAL SUMMARY ===== */}
                    <div className="space-y-1 text-sm mb-6">
                        <div className="flex justify-between">
                            <span>TOTAL PENGELUARAN Kas Kecil tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span className="font-mono">{formatNumber(totalOut)} -</span>
                        </div>
                        <div className="flex justify-between">
                            <span>UANG MASUK Kas Kecil tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span className="font-mono">{formatNumber(totalIn)} +</span>
                        </div>
                        <div className="flex justify-between">
                            <span>PENGEMBALIAN KAS BON tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span className="font-mono">{formatNumber(0)} -</span>
                        </div>
                        <div className="flex justify-between">
                            <span>SALDO AKHIR Kas Kecil tgl {format(date, 'd MMM yyyy', { locale: localeID })} :</span>
                            <span>&nbsp;</span>
                        </div>
                        <div className="flex justify-between font-bold text-base border-t border-black pt-1">
                            <span>KAS KECIL</span>
                            <span className="font-mono">{formatNumber(closingBalance)}</span>
                        </div>
                    </div>

                    {/* ===== DENOMINASI ===== */}
                    <div className="mb-4">
                        <p className="text-sm mb-2">Jumlah fisik uang kontan yang dihitung terdiri dari :</p>
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border border-black">
                                    <th className="border border-black px-2 py-1 text-right">Pecahan</th>
                                    <th className="border border-black px-2 py-1 text-center w-8">X</th>
                                    <th className="border border-black px-2 py-1 text-center w-20">Jumlah</th>
                                    <th className="border border-black px-2 py-1 text-center w-8">:</th>
                                    <th className="border border-black px-2 py-1 text-right w-32">Total</th>
                                    <th className="border border-black px-2 py-1 text-center w-16">Ket</th>
                                </tr>
                            </thead>
                            <tbody>
                                {denominationRows.map((row, i) => (
                                    <tr key={i} className="border border-black">
                                        <td className="border border-black px-2 py-0.5 text-right font-mono">{row.label}</td>
                                        <td className="border border-black px-2 py-0.5 text-center">X</td>
                                        <td className="border border-black px-1 py-0.5 text-center">
                                            <Input
                                                type="number"
                                                className="h-6 text-center border-0 p-0 text-sm font-mono bg-transparent"
                                                value={row.count || ''}
                                                onChange={(e) => updateDenomination(i, parseInt(e.target.value) || 0)}
                                                min={0}
                                            />
                                        </td>
                                        <td className="border border-black px-2 py-0.5 text-center">:</td>
                                        <td className="border border-black px-2 py-0.5 text-right font-mono">
                                            {row.total > 0 ? formatNumber(row.total) : ''}
                                        </td>
                                        <td className="border border-black px-2 py-0.5 text-center text-xs text-muted-foreground">
                                            {row.type || ''}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* ===== REKONSILIASI ===== */}
                    <div className="mb-6">
                        <hr className="border-black mb-2" />
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span>Total fisik uang :</span>
                                <span className="font-mono font-bold">{formatNumber(totalFisik)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Selisih Lebih / Kurang :</span>
                                <span className={cn("font-mono font-bold", selisih !== 0 && "text-red-600")}>
                                    {selisih !== 0 ? formatNumber(selisih) : '0'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ===== CLOSING STATEMENT ===== */}
                    <div className="mb-8">
                        <p className="text-sm">
                            Demikian berita acara ini dibuat dengan sesungguhnya, Terima kasih.
                        </p>
                        <p className="text-sm mt-1">
                            Karanganyar, {dayName}, {dateFormatted}
                        </p>
                    </div>

                    {/* ===== SIGNATURES ===== */}
                    <div className="grid grid-cols-4 gap-6 text-center text-sm">
                        <div>
                            <p className="font-semibold">Kasir</p>
                            <div className="h-16" />
                            <p className="border-t border-black mx-2 pt-1">( Febyoni )</p>
                        </div>
                        <div>
                            <p className="font-semibold">Akuntansi</p>
                            <div className="h-16" />
                            <p className="border-t border-black mx-2 pt-1">( Akhmad A C )</p>
                        </div>
                        <div>
                            <p className="font-semibold">Direktur</p>
                            <div className="h-16" />
                            <p className="border-t border-black mx-2 pt-1">( Nugroho Pramono )</p>
                        </div>
                        <div>
                            <p className="font-semibold">Komisaris</p>
                            <div className="h-16" />
                            <p className="border-t border-black mx-2 pt-1">( Lie Mei Lie )</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
