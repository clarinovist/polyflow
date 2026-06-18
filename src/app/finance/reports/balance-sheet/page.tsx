'use client';

import { useState, useEffect } from 'react';
import { getBalanceSheet } from '@/actions/finance/accounting';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatRupiah } from '@/lib/utils/utils';
import { Button } from '@/components/ui/button';
import { RotateCw, Download } from 'lucide-react';
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils/utils"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { useCallback } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface BalanceSheetItem {
    id: string;
    code: string;
    name: string;
    netBalance: number;
    parentId: string | null;
}

interface BalanceSheetGroup {
    id: string;
    code: string;
    name: string;
    totalBalance: number;
    children: BalanceSheetItem[];
}

interface BalanceSheetData {
    // Flat (detail view)
    assets: BalanceSheetItem[];
    liabilities: BalanceSheetItem[];
    equity: BalanceSheetItem[];
    // Grouped (summary view)
    assetGroups: (BalanceSheetGroup | BalanceSheetItem)[];
    liabilityGroups: (BalanceSheetGroup | BalanceSheetItem)[];
    equityGroups: (BalanceSheetGroup | BalanceSheetItem)[];
    // Totals
    totalAssets: number;
    totalLiabilities: number;
    unpostedEarnings: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
}

function isGroup(item: BalanceSheetGroup | BalanceSheetItem): item is BalanceSheetGroup {
    return 'children' in item;
}

export default function BalanceSheetPage() {
    const [data, setData] = useState<BalanceSheetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());
    const [hideZero, setHideZero] = useState(true);
    const [summaryView, setSummaryView] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getBalanceSheet(date);
            if (result && 'success' in result && result.success) {
                setData(result.data as unknown as BalanceSheetData);
            } else {
                console.error("Failed to load balance sheet:", result && 'error' in result ? result.error : 'Unknown error');
                setData(null);
            }
        } catch (error) {
            console.error("Failed to load balance sheet", error);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const renderGroupedSection = (
        groups: (BalanceSheetGroup | BalanceSheetItem)[],
        hideZero: boolean
    ) => {
        return groups
            .filter(item => !hideZero || (isGroup(item)
                ? Math.abs(item.totalBalance) > 0.01
                : Math.abs(item.netBalance) > 0.01))
            .map((item) => {
                if (isGroup(item)) {
                    return (
                        <TableRow key={item.id}>
                            <TableCell className="pl-4 font-semibold">{item.name}</TableCell>
                            <TableCell className="font-mono text-xs">{item.code}</TableCell>
                            <TableCell className="text-right font-semibold">{formatRupiah(item.totalBalance)}</TableCell>
                        </TableRow>
                    );
                }
                return (
                    <TableRow key={item.id}>
                        <TableCell className="pl-8">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs">{item.code}</TableCell>
                        <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                    </TableRow>
                );
            });
    };

    const renderDetailSection = (
        items: BalanceSheetItem[],
        hideZero: boolean
    ) => {
        return items
            .filter(item => !hideZero || Math.abs(item.netBalance) > 0.01)
            .map((item) => (
                <TableRow key={item.id}>
                    <TableCell className="pl-8">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.code}</TableCell>
                    <TableCell className="text-right">{formatRupiah(item.netBalance)}</TableCell>
                </TableRow>
            ));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Balance Sheet</h1>
                    <p className="text-muted-foreground">
                        Financial Position as of {format(date, "PPP")}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                className={cn(
                                    "w-[240px] justify-start text-left font-normal",
                                    !date && "text-muted-foreground"
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? format(date, "PPP") : <span>Pick a date</span>}
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
                    <Button variant="outline" size="icon" onClick={fetchData}>
                        <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-6 bg-muted/20 p-3 rounded-lg border w-fit">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="summary-view"
                        checked={summaryView}
                        onCheckedChange={setSummaryView}
                    />
                    <Label htmlFor="summary-view" className="cursor-pointer font-medium">
                        Ringkas
                    </Label>
                </div>
                <div className="flex items-center space-x-2">
                    <Switch
                        id="hide-zero"
                        checked={hideZero}
                        onCheckedChange={setHideZero}
                    />
                    <Label htmlFor="hide-zero" className="cursor-pointer font-medium">
                        Sembunyikan Saldo Nol
                    </Label>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>
                        {summaryView ? 'Neraca (Ringkas)' : 'Neraca (Detail)'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Akun</TableHead>
                                    <TableHead>Kode</TableHead>
                                    <TableHead className="text-right">Jumlah</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">Loading...</TableCell>
                                    </TableRow>
                                ) : !data ? (
                                    <TableRow>
                                        <TableCell colSpan={3} className="h-24 text-center">Tidak ada data</TableCell>
                                    </TableRow>
                                ) : (
                                    <>
                                        {/* ASSETS */}
                                        <TableRow className="bg-muted/50 font-bold">
                                            <TableCell colSpan={3}>ASET</TableCell>
                                        </TableRow>
                                        {summaryView
                                            ? renderGroupedSection(data.assetGroups, hideZero)
                                            : renderDetailSection(data.assets, hideZero)
                                        }
                                        <TableRow className="font-bold border-t-2 bg-muted/30">
                                            <TableCell colSpan={2}>TOTAL ASET</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalAssets)}</TableCell>
                                        </TableRow>

                                        {/* LIABILITIES */}
                                        <TableRow className="bg-muted/50 font-bold mt-4">
                                            <TableCell colSpan={3}>KEWAJIBAN</TableCell>
                                        </TableRow>
                                        {summaryView
                                            ? renderGroupedSection(data.liabilityGroups, hideZero)
                                            : renderDetailSection(data.liabilities, hideZero)
                                        }
                                        <TableRow className="font-bold border-t-2 bg-muted/30">
                                            <TableCell colSpan={2}>TOTAL KEWAJIBAN</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalLiabilities)}</TableCell>
                                        </TableRow>

                                        {/* EQUITY */}
                                        <TableRow className="bg-muted/50 font-bold mt-4">
                                            <TableCell colSpan={3}>EKUITAS</TableCell>
                                        </TableRow>
                                        {summaryView
                                            ? renderGroupedSection(data.equityGroups, hideZero)
                                            : renderDetailSection(data.equity, hideZero)
                                        }

                                        {/* Unposted Current Earnings (P&L not yet closed) */}
                                        {Math.abs(data.unpostedEarnings) > 0.01 && (
                                            <TableRow>
                                                <TableCell className="pl-8 italic text-muted-foreground">Laba Periode Berjalan (Belum Diclose)</TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">—</TableCell>
                                                <TableCell className="text-right text-muted-foreground">{formatRupiah(data.unpostedEarnings)}</TableCell>
                                            </TableRow>
                                        )}

                                        <TableRow className="font-bold border-t-2 bg-muted/30">
                                            <TableCell colSpan={2}>TOTAL EKUITAS</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalEquity + data.unpostedEarnings)}</TableCell>
                                        </TableRow>

                                        <TableRow className="bg-primary/10 font-bold text-lg border-t-4 border-primary">
                                            <TableCell colSpan={2}>TOTAL KEWAJIBAN & EKUITAS</TableCell>
                                            <TableCell className="text-right">{formatRupiah(data.totalLiabilitiesAndEquity)}</TableCell>
                                        </TableRow>
                                    </>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
