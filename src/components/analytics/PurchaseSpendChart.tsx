'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { formatRupiah } from '@/lib/utils';
import { PurchaseSpendItem } from '@/types/analytics';

interface PurchaseSpendChartProps {
    data: PurchaseSpendItem[];
}

export function PurchaseSpendChart({ data }: PurchaseSpendChartProps) {
    return (
        <Card className="col-span-2">
            <CardHeader>
                <CardTitle>Spending Trend</CardTitle>
                <CardDescription>
                    Tracking purchasing spend over time
                </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="period"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 12 }}
                                minTickGap={20}
                            />
                            <YAxis
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value / 1000000}`}
                                tick={{ fontSize: 12 }}
                                width={50}
                            />
                            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                            <Tooltip
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: unknown) => {
                                    return [formatRupiah(Number(value)), 'Spend'] as [string, string];
                                }}
                                labelStyle={{ color: '#111827', fontWeight: 600 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="spend"
                                stroke="#f97316"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorSpend)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
