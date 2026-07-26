'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Activity } from 'lucide-react';
import type { OperatorTodaySummary } from '@/actions/production/production-execution';

interface KioskTodayStripProps {
    operatorName: string;
    summary: OperatorTodaySummary | null;
    isLoading?: boolean;
}

export function KioskTodayStrip({
    operatorName,
    summary,
    isLoading,
}: KioskTodayStripProps) {
    const hasOutput =
        summary &&
        (summary.jobCount > 0 ||
            summary.goodQty > 0 ||
            summary.scrapQty > 0 ||
            summary.activeJobsCount > 0);

    return (
        <Card className="border border-border/80 bg-card/60 shadow-sm overflow-hidden">
            <CardContent className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium mb-0.5">
                        <Activity className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate">
                            Hari ini · {operatorName}
                        </span>
                    </div>
                    {isLoading ? (
                        <p className="text-sm text-muted-foreground animate-pulse">
                            Memuat ringkasan shift...
                        </p>
                    ) : hasOutput && summary ? (
                        <p className="text-sm font-semibold text-foreground flex items-center flex-wrap gap-x-2 gap-y-1">
                            <span>{summary.jobCount} job</span>
                            <span className="text-muted-foreground">•</span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                                {summary.goodQty.toLocaleString('id-ID')} kg
                                bagus
                            </span>
                            <span className="text-muted-foreground">•</span>
                            <span
                                className={
                                    summary.scrapQty > 0
                                        ? 'text-amber-700 dark:text-amber-400'
                                        : 'text-muted-foreground'
                                }
                            >
                                {summary.scrapQty.toLocaleString('id-ID')} kg
                                scrap
                            </span>
                            {summary.activeJobsCount > 0 && (
                                <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                                    {summary.activeJobsCount} aktif
                                </span>
                            )}
                        </p>
                    ) : (
                        <p className="text-sm text-muted-foreground">
                            Belum ada output hari ini
                        </p>
                    )}
                </div>

                <Link
                    href="/my"
                    className="inline-flex items-center justify-center sm:justify-start min-h-10 sm:min-h-0 px-3 sm:px-0 rounded-lg sm:rounded-none border sm:border-0 bg-muted/40 sm:bg-transparent text-xs font-semibold text-primary hover:underline shrink-0 gap-1"
                >
                    Lihat di Status Saya
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </CardContent>
        </Card>
    );
}
