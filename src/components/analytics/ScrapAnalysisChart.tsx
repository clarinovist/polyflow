'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QualityControlSummary } from "@/types/analytics";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface ScrapAnalysisChartProps {
    data: QualityControlSummary;
}

const COLORS = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981', '#6366f1'];

export function ScrapAnalysisChart({ data }: ScrapAnalysisChartProps) {
    // Transform scrapByReason for PieChart
    const chartData = data.scrapByReason.map((item, index) => ({
        name: item.reason,
        value: item.quantity,
        color: COLORS[index % COLORS.length]
    })).filter(item => item.value > 0);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Scrap Analysis</CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                        No scrap data available
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
