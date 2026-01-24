'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface StockMovementData {
    date: string;
    in: number;
    out: number;
    transfer: number;
    adjustment: number;
}

interface StockMovementTrendsChartProps {
    data: StockMovementData[];
    loading?: boolean;
}

export function StockMovementTrendsChart({ data, loading }: StockMovementTrendsChartProps) {
    if (loading) {
        return (
            <Card className="h-full flex items-center justify-center min-h-[300px]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </Card>
        );
    }

    if (!data || data.length === 0) {
        return (
            <Card className="h-full flex items-center justify-center min-h-[300px]">
                <p className="text-muted-foreground">No movement data available</p>
            </Card>
        );
    }

    return (
        <Card className="col-span-4 h-full">
            <CardHeader>
                <CardTitle>Stock Movement Trends</CardTitle>
                <CardDescription>
                    Inbound vs Outbound stock movements over time
                </CardDescription>
            </CardHeader>
            <CardContent className="pl-0">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{
                                top: 10,
                                right: 30,
                                left: 0,
                                bottom: 0,
                            }}
                        >
                            <defs>
                                <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                            <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(str) => format(parseISO(str), 'MMM d')}
                                className="text-xs text-muted-foreground"
                                dy={10}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                className="text-xs text-muted-foreground"
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    borderColor: 'hsl(var(--border))',
                                    borderRadius: 'var(--radius)',
                                }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                                labelFormatter={(label) => format(parseISO(label), 'PPP')}
                            />
                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                            <Area
                                type="monotone"
                                dataKey="in"
                                name="Inbound (In)"
                                stroke="#10b981"
                                fillOpacity={1}
                                fill="url(#colorIn)"
                                strokeWidth={2}
                            />
                            <Area
                                type="monotone"
                                dataKey="out"
                                name="Outbound (Out)"
                                stroke="#ef4444"
                                fillOpacity={1}
                                fill="url(#colorOut)"
                                strokeWidth={2}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
