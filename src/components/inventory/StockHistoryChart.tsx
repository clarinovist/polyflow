'use client';

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';

interface StockHistoryChartProps {
    data: { date: string; stock: number }[];
    title?: string;
    variantName?: string;
}

export function StockHistoryChart({ data, title, variantName }: StockHistoryChartProps) {
    if (!data || data.length === 0) {
        return (
            <Card className="w-full h-[400px] flex items-center justify-center text-slate-500">
                No historical data available for this range
            </Card>
        );
    }

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center justify-between">
                    <span>{title || 'Stock Level History'}</span>
                    {variantName && (
                        <span className="text-sm font-normal text-slate-500">
                            {variantName}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                            data={data}
                            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                        >
                            <defs>
                                <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(str) => {
                                    const date = parseISO(str);
                                    return format(date, 'MMM d');
                                }}
                                tick={{ fontSize: 12, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 12, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(val) => val.toLocaleString()}
                            />
                            <Tooltip
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-white p-3 border rounded-lg shadow-lg border-slate-100">
                                                <p className="text-sm font-medium text-slate-900 border-b pb-1 mb-2">
                                                    {format(parseISO(label as string), 'MMMM d, yyyy')}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                                                    <p className="text-sm font-semibold text-blue-600">
                                                        Stock: {payload[0].value?.toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="stock"
                                stroke="#2563eb"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorStock)"
                                animationDuration={1000}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
