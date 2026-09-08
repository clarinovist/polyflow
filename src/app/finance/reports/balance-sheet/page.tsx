'use client';

import { useState, useEffect, useRef } from 'react';
import { getBalanceSheet } from '@/actions/finance/accounting';
import { Button } from '@/components/ui/button';
import { RotateCw, Download } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils/utils';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { useCallback } from 'react';
import { reportLabels } from '@/lib/labels';
import { toBusinessDateString } from '@/lib/utils/timezone';
import { BalanceSheetReport } from '@/components/finance/reports/BalanceSheetReport';
import {
    downloadCsv,
    rupiahForCsv,
    reportFilename,
} from '@/lib/utils/csv-export';

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

function isGroup(
    item: BalanceSheetGroup | BalanceSheetItem,
): item is BalanceSheetGroup {
    return 'children' in item;
}

export default function BalanceSheetPage() {
    const [data, setData] = useState<BalanceSheetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [date, setDate] = useState<Date>(new Date());
    const requestGenerationRef = useRef(0);

    const handleDateChange = useCallback((nextDate: Date) => {
        requestGenerationRef.current += 1;
        setLoading(true);
        setDate(nextDate);
    }, []);

    const fetchData = useCallback(async () => {
        const generation = ++requestGenerationRef.current;
        setLoading(true);
        try {
            const result = await getBalanceSheet(date);
            if (generation !== requestGenerationRef.current) return;

            if (result && 'success' in result && result.success) {
                setData(result.data as unknown as BalanceSheetData);
            } else {
                console.error(
                    'Failed to load balance sheet:',
                    result && 'error' in result
                        ? result.error
                        : 'Unknown error',
                );
                setData(null);
            }
        } catch (error) {
            if (generation !== requestGenerationRef.current) return;
            console.error('Failed to load balance sheet', error);
            setData(null);
        } finally {
            if (generation === requestGenerationRef.current) {
                setLoading(false);
            }
        }
    }, [date]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleDownload = () => {
        if (!data) return;
        const headers = ['Akun', 'Kode', 'Jumlah (IDR)'];
        const rows: (string | number)[][] = [];

        const addGroups = (
            groups: (BalanceSheetGroup | BalanceSheetItem)[],
        ) => {
            for (const item of groups) {
                if (isGroup(item)) {
                    rows.push([
                        item.name,
                        item.code,
                        rupiahForCsv(item.totalBalance),
                    ]);
                    for (const child of item.children.filter(
                        (c) => Math.abs(c.netBalance) > 0.01,
                    )) {
                        rows.push([
                            `  ${child.name}`,
                            child.code,
                            rupiahForCsv(child.netBalance),
                        ]);
                    }
                } else if (Math.abs(item.netBalance) > 0.01) {
                    rows.push([
                        item.name,
                        item.code,
                        rupiahForCsv(item.netBalance),
                    ]);
                }
            }
        };

        rows.push(['ASET', '', '']);
        addGroups(data.assetGroups);
        rows.push(['TOTAL ASET', '', rupiahForCsv(data.totalAssets)]);
        rows.push(['', '', '']);
        rows.push(['KEWAJIBAN', '', '']);
        addGroups(data.liabilityGroups);
        rows.push(['TOTAL KEWAJIBAN', '', rupiahForCsv(data.totalLiabilities)]);
        rows.push(['', '', '']);
        rows.push(['EKUITAS', '', '']);
        addGroups(data.equityGroups);
        if (Math.abs(data.unpostedEarnings) > 0.01) {
            rows.push([
                'Laba Periode Berjalan (Belum Diclose)',
                '—',
                rupiahForCsv(data.unpostedEarnings),
            ]);
        }
        rows.push([
            'TOTAL EKUITAS',
            '',
            rupiahForCsv(data.totalEquity + data.unpostedEarnings),
        ]);
        rows.push(['', '', '']);
        rows.push([
            'TOTAL KEWAJIBAN & EKUITAS',
            '',
            rupiahForCsv(data.totalLiabilitiesAndEquity),
        ]);

        const dateStr = format(date, 'yyyy-MM-dd');
        downloadCsv(reportFilename('Neraca', dateStr), headers, rows);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {reportLabels.balanceSheet}
                    </h1>
                    <p className="text-muted-foreground">
                        {reportLabels.financialPosition} {format(date, 'PPP')}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant={'outline'}
                                className={cn(
                                    'w-[240px] justify-start text-left font-normal',
                                    !date && 'text-muted-foreground',
                                )}
                            >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {date ? (
                                    format(date, 'PPP')
                                ) : (
                                    <span>{reportLabels.pickDate}</span>
                                )}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                            <Calendar
                                mode="single"
                                selected={date}
                                onSelect={(d) => d && handleDateChange(d)}
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
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleDownload}
                        disabled={!data}
                    >
                        <Download className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="h-24 rounded-md border flex items-center justify-center text-muted-foreground">
                    Loading...
                </div>
            ) : !data ? (
                <div className="h-24 rounded-md border flex items-center justify-center text-muted-foreground">
                    Tidak ada data
                </div>
            ) : (
                <BalanceSheetReport
                    data={data}
                    asOfDate={toBusinessDateString(date)}
                />
            )}
        </div>
    );
}
