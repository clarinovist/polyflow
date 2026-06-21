'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import { formatRupiah } from '@/lib/utils/utils';

interface StatusItem {
    status: string;
    count: number;
    value: number;
    percentage?: number;
}

interface StatusDistributionChartProps {
    title: string;
    description: string;
    data: StatusItem[];
    colors?: string[];
    emptyMessage?: string;
}

const DEFAULT_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'];

export function StatusDistributionChart({
    title,
    description,
    data,
    colors = DEFAULT_COLORS,
    emptyMessage = 'Tidak ada data.',
}: StatusDistributionChartProps) {
    const formattedData = data.map(item => ({
        ...item,
        statusName: item.status?.replace(/_/g, ' ') || 'Unknown'
    }));

    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {data.length === 0 ? (
                    <p className="text-muted-foreground py-8 text-center text-sm">{emptyMessage}</p>
                ) : (
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
                                    formatter={(value: unknown) => [formatRupiah(Number(value)), 'Nilai']}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {formattedData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                                    ))}
                                    <LabelList
                                        dataKey="count"
                                        position="right"
                                        formatter={(val: unknown) => `${val} pesanan`}
                                        style={{ fontSize: 12, fill: '#64748b' }}
                                    />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
