'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDailyPettyCashReportAction } from '@/actions/finance/petty-cash-report-actions';
import { Button } from '@/components/ui/button';
import { RotateCw, Printer, CalendarIcon } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils/utils";
import { format, subDays } from "date-fns";
import { id as localeID } from "date-fns/locale";
import { formatWibDate } from "@/lib/utils/timezone";
import Link from "next/link";

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

interface LedgerRow {
    id: string;
    date: string;
    noInv: string;
    voucherNumber: string;
    memo: string;
    debit: number;
    credit: number;
    runningBalance: number;
}

function formatNumber(n: number): string {
    return n.toLocaleString('id-ID').replace(/,/g, '.');
}

export default function RekapKasPage() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());

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

    // Previous day for opening balance reference
    const prevDate = subDays(date, 1);

    const dayName = format(date, 'EEEE', { locale: localeID });
    const dateFormatted = format(date, 'd MMMM yyyy', { locale: localeID });

    // Build ledger rows with running balance
    const buildLedgerRows = (data: ReportData): LedgerRow[] => {
        const rows: LedgerRow[] = [];
        let runningBalance = data.openingBalance;

        // 1) Opening balance row
        rows.push({
            id: 'opening',
            date: format(prevDate, 'dd MMM yyyy', { locale: localeID }),
            noInv: '',
            voucherNumber: '',
            memo: 'SALDO AWAL',
            debit: 0,
            credit: 0,
            runningBalance,
        });

        // Filter posted transactions
        const posted = data.transactions.filter(t => t.status === 'POSTED');

        // 2) Cash inflows (REPLENISHMENT → Debit / BKM)
        const inflows = posted.filter(t => t.type === 'REPLENISHMENT');
        inflows.forEach((t, i) => {
            const amt = Number(t.amount);
            runningBalance += amt;
            rows.push({
                id: t.id,
                date: formatWibDate(t.date),
                noInv: '',
                voucherNumber: `BKM-${String(i + 1).padStart(2, '0')}/${format(date, 'MM/yy')}`,
                memo: t.description,
                debit: amt,
                credit: 0,
                runningBalance,
            });
        });

        // 3) Cash outflows (EXPENSE → Credit / BKK)
        const outflows = posted.filter(t => t.type === 'EXPENSE');
        outflows.forEach((t, i) => {
            const amt = Number(t.amount);
            runningBalance -= amt;
            rows.push({
                id: t.id,
                date: formatWibDate(t.date),
                noInv: '',
                voucherNumber: `BKK-${String(i + 1).padStart(2, '0')}/${format(date, 'MM/yy')}`,
                memo: t.description,
                debit: 0,
                credit: amt,
                runningBalance,
            });
        });

        return rows;
    };

    const ledgerRows = data ? buildLedgerRows(data) : [];

    return (
        <div>
            {/* Print styles */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    aside, header, .h-16.lg\\\\\\\\:hidden, .print\\\\\\\\:hidden, button, .no-print, nav {
                        display: none !important;
                    }
                    main, .lg\\\\\\\\:ml-64, .p-4, .md\\\\\\\\:p-6, .lg\\\\\\\\:p-8 {
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
                }
            `}} />

            {/* Controls (hidden on print) */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 print:hidden">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Rekap Pemasukan & Pengeluaran Kas</h1>
                    <p className="text-muted-foreground">Cash opname kas kecil harian dengan detail transaksi</p>
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
                    <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-400 dark:hover:bg-purple-300 dark:text-gray-900" onClick={handlePrint} disabled={loading || !data}>
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
                <div className="print-container max-w-4xl mx-auto bg-white dark:bg-gray-900 p-8 border rounded-lg shadow-sm">
                    {/* ===== HEADER ===== */}
                    <div className="text-center mb-2">
                        <h1 className="text-xl font-bold tracking-wide text-gray-900 dark:text-gray-100">
                            REKAP PEMASUKAN & PENGELUARAN KAS
                        </h1>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Cash Opname : Kas Kecil
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                            Tanggal : {dayName}, {dateFormatted}
                        </p>
                    </div>
                    <hr className="border-black dark:border-gray-600 mb-3" />

                    {/* ===== TOTAL DEBIT / KREDIT SUMMARY ===== */}
                    <div className="flex justify-between text-sm font-semibold mb-4 px-2">
                        <div className="text-gray-900 dark:text-gray-100">
                            Total Pemasukan (Debit) : <span className="font-mono">{formatNumber(data.totalIn)}</span>
                        </div>
                        <div className="text-gray-900 dark:text-gray-100">
                            Total Pengeluaran (Kredit) : <span className="font-mono">{formatNumber(data.totalOut)}</span>
                        </div>
                    </div>

                    {/* ===== LEDGER TABLE ===== */}
                    <div className="mb-6">
                        <table className="w-full border-collapse text-sm">
                            <thead>
                                <tr className="border border-black dark:border-gray-600">
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-left w-24 text-gray-900 dark:text-gray-100">TANGGAL</th>
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-left w-28 text-gray-900 dark:text-gray-100">NO INV/ NO PO</th>
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-left w-32 text-gray-900 dark:text-gray-100">NOMOR BUKTI TRANSAKSI</th>
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-left text-gray-900 dark:text-gray-100">MEMO</th>
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-right w-32 text-gray-900 dark:text-gray-100">DEBIT</th>
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-right w-32 text-gray-900 dark:text-gray-100">KREDIT</th>
                                    <th className="border border-black dark:border-gray-600 px-2 py-1.5 text-right w-36 text-gray-900 dark:text-gray-100">SALDO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ledgerRows.map((row, i) => {
                                    const isOpening = i === 0;
                                    return (
                                        <tr
                                            key={i}
                                            className={cn(
                                                "border border-black dark:border-gray-600",
                                                isOpening && "bg-gray-50 dark:bg-gray-800 font-semibold"
                                            )}
                                        >
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 text-gray-800 dark:text-gray-200">
                                                {row.date}
                                            </td>
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 text-xs text-gray-800 dark:text-gray-200">
                                                {row.noInv}
                                            </td>
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 font-mono text-xs text-gray-800 dark:text-gray-200">
                                                {row.id !== 'opening' && row.voucherNumber ? (
                                                    <Link
                                                        href="/finance/petty-cash"
                                                        className="text-blue-600 dark:text-blue-400 hover:underline"
                                                        title="Lihat detail transaksi"
                                                    >
                                                        {row.voucherNumber}
                                                    </Link>
                                                ) : (
                                                    row.voucherNumber
                                                )}
                                            </td>
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 text-gray-800 dark:text-gray-200">
                                                {row.memo}
                                            </td>
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 text-right font-mono text-gray-800 dark:text-gray-200">
                                                {row.debit > 0 ? formatNumber(row.debit) : ''}
                                            </td>
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 text-right font-mono text-gray-800 dark:text-gray-200">
                                                {row.credit > 0 ? formatNumber(row.credit) : ''}
                                            </td>
                                            <td className="border border-black dark:border-gray-600 px-2 py-1 text-right font-mono font-semibold text-gray-800 dark:text-gray-200">
                                                {formatNumber(row.runningBalance)}
                                            </td>
                                        </tr>
                                    );
                                })}

                                {ledgerRows.length <= 1 && (
                                    <tr className="border border-black dark:border-gray-600">
                                        <td colSpan={7} className="border border-black dark:border-gray-600 px-2 py-3 text-center text-muted-foreground italic">
                                            Tidak ada transaksi terposting pada tanggal ini
                                        </td>
                                    </tr>
                                )}

                                {/* Summary row */}
                                <tr className="border border-black dark:border-gray-600 font-bold bg-gray-50 dark:bg-gray-800">
                                    <td colSpan={4} className="border border-black dark:border-gray-600 px-2 py-1.5 text-right text-gray-900 dark:text-gray-100">
                                        TOTAL :
                                    </td>
                                    <td className="border border-black dark:border-gray-600 px-2 py-1.5 text-right font-mono text-gray-900 dark:text-gray-100">
                                        {formatNumber(data.totalIn)}
                                    </td>
                                    <td className="border border-black dark:border-gray-600 px-2 py-1.5 text-right font-mono text-gray-900 dark:text-gray-100">
                                        {formatNumber(data.totalOut)}
                                    </td>
                                    <td className="border border-black dark:border-gray-600 px-2 py-1.5 text-right font-mono text-gray-900 dark:text-gray-100">
                                        {formatNumber(data.closingBalance)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* ===== VERIFICATION FORMULA ===== */}
                    <div className="mb-8 text-sm text-gray-700 dark:text-gray-300">
                        <p>
                            Saldo Awal ({formatNumber(data.openingBalance)}) + Total Debit ({formatNumber(data.totalIn)}) - Total Kredit ({formatNumber(data.totalOut)}) = <strong className="font-mono">{formatNumber(data.closingBalance)}</strong>
                        </p>
                    </div>


                </div>
            )}
        </div>
    );
}
