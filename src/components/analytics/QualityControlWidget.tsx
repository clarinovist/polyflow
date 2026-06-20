import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QualityControlSummary } from '@/types/analytics';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { analyticsLabels } from '@/lib/labels';
import { AlertCircle, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';

interface Props {
    data: QualityControlSummary;
}

const COLORS = {
    PASS: '#10b981', // green-500
    FAIL: '#ef4444', // red-500
    QUARANTINE: '#f59e0b', // amber-500
};

export function QualityControlWidget({ data }: Props) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMounted(true);
    }, []);

    const pieData = [
        { name: 'Pass', value: data.inspections.pass, color: COLORS.PASS },
        { name: 'Fail', value: data.inspections.fail, color: COLORS.FAIL },
        { name: 'Quarantine', value: data.inspections.quarantine, color: COLORS.QUARANTINE },
    ].filter(d => d.value > 0);

    return (
        <div className="space-y-6">
            {/* Inspection Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wide">Total Inspections</p>
                        <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2">{data.inspections.total}</p>
                    </CardContent>
                </Card>
                <Card className="bg-green-50 dark:bg-emerald-900/20 border-green-100 dark:border-emerald-800/50">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-2 mb-1">
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-emerald-400" />
                            <p className="text-sm text-green-700 dark:text-emerald-400 font-medium uppercase tracking-wide">Passed</p>
                        </div>
                        <p className="text-3xl font-bold text-green-800 dark:text-emerald-400">{data.inspections.pass}</p>
                        <p className="text-xs text-green-600 dark:text-emerald-400 mt-1">{data.inspections.passRate}% Rate</p>
                    </CardContent>
                </Card>
                <Card className="bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-2 mb-1">
                            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <p className="text-sm text-red-700 dark:text-red-400 font-medium uppercase tracking-wide">Failed</p>
                        </div>
                        <p className="text-3xl font-bold text-red-800 dark:text-red-400">{data.inspections.fail}</p>
                    </CardContent>
                </Card>
                <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50">
                    <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-2 mb-1">
                            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <p className="text-sm text-amber-700 dark:text-amber-400 font-medium uppercase tracking-wide">Quarantine</p>
                        </div>
                        <p className="text-3xl font-bold text-amber-800 dark:text-amber-400">{data.inspections.quarantine}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Inspection Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>{analyticsLabels.inspectionDistribution}</CardTitle>
                        <CardDescription>{analyticsLabels.inspectionDesc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {pieData.length === 0 ? (
                            <div className="h-[300px] flex items-center justify-center text-muted-foreground">{analyticsLabels.noInspectionData}</div>
                        ) : (
                            <div className="h-[300px] w-full relative" style={{ height: 300, minHeight: 300 }}>
                                {isMounted ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={100}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip />
                                            <Legend verticalAlign="bottom" height={36} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-muted/5 animate-pulse rounded" />
                                )}
                                {/* Center Text */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-3xl font-bold">{data.inspections.total}</span>
                                    <span className="text-xs text-muted-foreground uppercase">Total</span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Scrap Reasons */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400" />
                            Scrap Analysis
                        </CardTitle>
                        <CardDescription>{analyticsLabels.topScrapReasons}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {data.scrapByReason.length === 0 ? (
                                <p className="text-muted-foreground text-center py-10">Tidak ada catatan scrap ditemukan.</p>
                            ) : (
                                data.scrapByReason.map((item, idx) => (
                                    <div key={idx} className="space-y-1">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-medium">{item.reason || 'Unspecified'}</span>
                                            <span className="text-muted-foreground">{item.quantity.toLocaleString()} units ({item.percentage}%)</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-red-400 dark:bg-red-500 rounded-full"
                                                style={{ width: `${Math.min(item.percentage, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
