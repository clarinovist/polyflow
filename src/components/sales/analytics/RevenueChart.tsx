'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesMetrics } from '@/actions/analytics';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import { formatRupiah } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface RevenueChartProps {
    data: SalesMetrics['revenueTrend'];
}

export function RevenueChart({ data }: RevenueChartProps) {
    return (
        <Card className="col-span-4">
            <CardHeader>
                <CardTitle>Revenue Over Time</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => format(parseISO(value), 'd MMM')}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `Rp ${value / 1000}k`}
                            />
                            <Tooltip
                                formatter={(value: number | undefined) => [formatRupiah(value ?? 0), 'Revenue']}
                                labelFormatter={(label) => format(parseISO(label as string), 'd MMMM yyyy')}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke="#2563eb" // primary blue
                                strokeWidth={2}
                                activeDot={{ r: 4 }}
                                dot={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
