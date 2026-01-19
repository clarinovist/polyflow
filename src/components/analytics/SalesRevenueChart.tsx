'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatRupiah } from '@/lib/utils';
import { SalesRevenueItem } from '@/types/analytics';
import { format } from 'date-fns';

interface SalesRevenueChartProps {
    data: SalesRevenueItem[];
}

export function SalesRevenueChart({ data }: SalesRevenueChartProps) {
    return (
        <Card className="col-span-2">
            <CardHeader>
                <CardTitle>Revenue Awareness</CardTitle>
                <CardDescription>
                    Tracking sales revenue over time
                </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(str) => format(new Date(str), 'MMM d')}
                                tick={{ fontSize: 12 }}
                                minTickGap={20}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `Rp${(value / 1000000).toFixed(0)}M`}
                                tick={{ fontSize: 12 }}
                                width={80}
                            />
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: unknown) => {
                                    return [formatRupiah(Number(value)), 'Revenue'] as [string, string];
                                }}
                                labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                            />
                            <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorRevenue)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
