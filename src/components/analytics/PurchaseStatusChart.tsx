'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import { formatRupiah } from '@/lib/utils';
import { PurchaseByStatusItem } from '@/types/analytics';

interface PurchaseStatusChartProps {
    data: PurchaseByStatusItem[];
}

const COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export function PurchaseStatusChart({ data }: PurchaseStatusChartProps) {
    const formattedData = data.map(item => ({
        ...item,
        statusName: item.status.replace(/_/g, ' ')
    }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>Purchase Order Status</CardTitle>
                <CardDescription>Value distribution by status</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={formattedData} layout="vertical" margin={{ left: 20, right: 30 }}>
                            <XAxis type="number" hide />
                            <YAxis
                                dataKey="statusName"
                                type="category"
                                width={100}
                                tick={{ fontSize: 12 }}
                                tickLine={false}
                                axisLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: unknown) => [formatRupiah(Number(value)), 'Value']}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {formattedData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                                <LabelList
                                    dataKey="count"
                                    position="right"
                                    formatter={(val: unknown) => `${val} orders`}
                                    style={{ fontSize: 12, fill: '#64748b' }}
                                />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}
