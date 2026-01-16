'use client';

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

interface VarianceItem {
    productName: string;
    sku: string;
    planned: number;
    actual: number;
    unit: string;
    variance: number; // actual - planned
    variancePercent: number; // (actual - planned) / planned * 100
    isScrap?: boolean;
}

interface VarianceAnalysisProps {
    items: VarianceItem[];
}

export function VarianceAnalysis({ items }: VarianceAnalysisProps) {
    if (items.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg font-medium flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-500" />
                    Material Variance Analysis
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {items.map((item) => {
                    const isOver = item.variance > 0;

                    // Thresholds for colors
                    // > 5% Over = Red
                    // < -5% Under = Yellow (Efficiency?)
                    // Within 5% = Green

                    let statusColor = "bg-green-500";
                    if (item.variancePercent > 5) statusColor = "bg-red-500";
                    else if (item.variancePercent < -5) statusColor = "bg-yellow-500";

                    return (
                        <div key={item.sku} className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <div>
                                    <span className="font-semibold">{item.productName}</span>
                                    <span className="text-xs text-muted-foreground ml-2">({item.sku})</span>
                                </div>
                                <div className="text-right">
                                    <span className={isOver ? "text-red-600 font-bold" : "text-green-600 font-bold"}>
                                        {isOver ? "+" : ""}{item.variance.toFixed(2)} {item.unit}
                                    </span>
                                    <Badge variant="outline" className="ml-2">
                                        {isOver ? "+" : ""}{item.variancePercent.toFixed(1)}%
                                    </Badge>
                                </div>
                            </div>

                            <div className="relative pt-1">
                                <div className="flex mb-1 items-center justify-between text-xs text-muted-foreground">
                                    <span>Used: {item.actual}</span>
                                    <span>Plan: {item.planned}</span>
                                </div>
                                {/* Progress bar logic: 
                                    If actual <= planned, fill is actual/planned.
                                    If actual > planned, fill is 100% but red.
                                */}
                                <Progress
                                    value={Math.min(100, (item.actual / (item.planned || 1)) * 100)}
                                    className={`h-2 ${statusColor}`}
                                // Override inner indicator color if possible, or just wrap
                                />
                            </div>
                        </div>
                    );
                })}
            </CardContent>
        </Card>
    );
}
