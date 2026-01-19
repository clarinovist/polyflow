'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductionRealizationItem } from "@/types/analytics";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";

interface ProductionRealizationChartProps {
    data: ProductionRealizationItem[];
}

export function ProductionRealizationChart({ data }: ProductionRealizationChartProps) {
    // Limit to top 10 recent orders or most significant ones for chart clarity
    const chartData = data.slice(0, 15);

    return (
        <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
                <CardTitle>Production Realization (Yield)</CardTitle>
            </CardHeader>
            <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <XAxis
                            dataKey="orderNumber"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value}`}
                        />
                        <Tooltip
                            content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                    return (
                                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="flex flex-col">
                                                    <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                        Planned
                                                    </span>
                                                    <span className="font-bold text-muted-foreground">
                                                        {payload[0].value}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[0.70rem] uppercase text-muted-foreground">
                                                        Actual
                                                    </span>
                                                    <span className="font-bold">
                                                        {payload[1].value}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                }
                                return null
                            }}
                        />
                        <Legend />
                        <Bar
                            dataKey="plannedQuantity"
                            name="Planned"
                            fill="#94a3b8"
                            radius={[4, 4, 0, 0]}
                        />
                        <Bar
                            dataKey="actualQuantity"
                            name="Actual"
                            fill="#2563eb"
                            radius={[4, 4, 0, 0]}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
