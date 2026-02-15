'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QualityControlSummary } from "@/types/analytics";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

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

    const productScrollData = data.scrapByProduct || [];

    return (
        <Card className="col-span-1 md:col-span-2">
            <CardHeader>
                <CardTitle>Scrap Analysis</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[300px]">
                    {/* Left: Scrap by Reason (Pie) */}
                    <div className="flex flex-col items-center justify-center">
                        <h4 className="text-sm font-medium text-muted-foreground mb-4">By Reason</h4>
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
                                    <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ paddingLeft: "20px" }} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                No scrap data available
                            </div>
                        )}
                    </div>

                    {/* Right: Scrap by Product (Bar) */}
                    <div className="flex flex-col">
                        <h4 className="text-sm font-medium text-muted-foreground mb-4">Top Scrap Products</h4>
                        {productScrollData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={productScrollData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="productName"
                                        type="category"
                                        width={100}
                                        tick={{ fontSize: 10 }}
                                        tickFormatter={(val) => val.length > 15 ? val.substring(0, 15) + '...' : val}
                                    />
                                    <Tooltip />
                                    <Bar dataKey="quantity" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} name="Qty" />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                                No product data available
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
