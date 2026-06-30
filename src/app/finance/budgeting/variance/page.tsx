'use client';

import { useState, useEffect, useCallback } from 'react';
import { getBudgetVariance } from '@/actions/finance/accounting';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils/utils';
import { downloadCsv, rupiahForCsv, reportFilename } from '@/lib/utils/csv-export';
import { Button } from '@/components/ui/button';
import { RotateCw, Download, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { reportLabels } from '@/lib/labels';
import { BudgetingTabs } from '@/components/finance/budget/BudgetingTabs';

interface VarianceItem {
    accountCode: string;
    accountName: string;
    budget: number;
    actual: number;
    variance: number;
    variancePercent: number;
}

export default function BudgetVariancePage() {
    const [data, setData] = useState<VarianceItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [year, setYear] = useState(new Date().getFullYear().toString());
    const [month, setMonth] = useState((new Date().getMonth() + 1).toString());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getBudgetVariance(parseInt(year), parseInt(month));
            if (result && 'success' in result && result.success) {
                setData(result.data as unknown as VarianceItem[]);
            } else {
                console.error("Failed to load variance report:", result && 'error' in result ? result.error : 'Unknown error');
                setData([]);
            }
        } catch (error) {
            console.error("Failed to load variance report", error);
            setData([]);
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const months = [
        { val: "1", label: "Januari" }, { val: "2", label: "Februari" }, { val: "3", label: "Maret" },
        { val: "4", label: "April" }, { val: "5", label: "Mei" }, { val: "6", label: "Juni" },
        { val: "7", label: "Juli" }, { val: "8", label: "Agustus" }, { val: "9", label: "September" },
        { val: "10", label: "Oktober" }, { val: "11", label: "November" }, { val: "12", label: "Desember" }
    ];

    const handleDownload = () => {
        if (data.length === 0) return;
        const headers = ['Kode Akun', 'Nama Akun', 'Budget', 'Aktual', 'Varians', '%'];
        const rows: (string | number)[][] = data.map(item => [
            item.accountCode,
            item.accountName,
            rupiahForCsv(item.budget),
            rupiahForCsv(item.actual),
            rupiahForCsv(item.variance),
            `${item.variancePercent.toFixed(1)}%`,
        ]);
        downloadCsv(reportFilename('Budget_Variance', `${year}-${month}`), headers, rows);
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-10">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{reportLabels.variansAnggaran}</h1>
                    <p className="text-muted-foreground">
                        {reportLabels.variansAnggaranDesc} {months.find(m => m.val === month)?.label} {year}.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="w-[100px]">
                            <SelectValue placeholder="Tahun" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="2024">2024</SelectItem>
                            <SelectItem value="2025">2025</SelectItem>
                            <SelectItem value="2026">2026</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select value={month} onValueChange={setMonth}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder={reportLabels.bulan} />
                        </SelectTrigger>
                        <SelectContent>
                            {months.map(m => (
                                <SelectItem key={m.val} value={m.val}>{m.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={fetchData}>
                        <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={handleDownload} disabled={data.length === 0}>
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <BudgetingTabs activeTab="variance" />

            <Card>
                <CardHeader>
                    <CardTitle>{reportLabels.variansAnggaran}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>{reportLabels.akun}</TableHead>
                                    <TableHead className="text-right">{reportLabels.anggaran}</TableHead>
                                    <TableHead className="text-right">{reportLabels.aktual}</TableHead>
                                    <TableHead className="text-right">{reportLabels.varians}</TableHead>
                                    <TableHead className="text-right">%</TableHead>
                                    <TableHead className="w-[100px]">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">{reportLabels.loading}</TableCell>
                                    </TableRow>
                                ) : data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center">Tidak ada budget untuk periode ini.</TableCell>
                                    </TableRow>
                                ) : (
                                    data.map((item) => {
                                        const isOver = item.variance > 0;
                                        const isUnder = item.variance < 0;

                                        return (
                                            <TableRow key={item.accountCode}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{item.accountName}</span>
                                                        <span className="text-xs text-muted-foreground font-mono">{item.accountCode}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.budget)}</TableCell>
                                                <TableCell className="text-right">{formatRupiah(item.actual)}</TableCell>
                                                <TableCell className={`text-right font-bold ${isOver ? 'text-blue-600' : isUnder ? 'text-amber-600' : ''}`}>
                                                    {formatRupiah(item.variance)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {item.variancePercent.toFixed(1)}%
                                                </TableCell>
                                                <TableCell>
                                                    {isOver ? (
                                                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">
                                                            <ArrowUpRight className="h-3 w-3 mr-1" /> Di Atas
                                                        </Badge>
                                                    ) : isUnder ? (
                                                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                                                            <ArrowDownRight className="h-3 w-3 mr-1" /> Di Bawah
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-slate-500">
                                                            <Minus className="h-3 w-3 mr-1" /> Sesuai
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
