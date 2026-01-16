import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MachinePerformanceItem } from '@/types/analytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props {
    data: MachinePerformanceItem[];
}

export function MachinePerformanceChart({ data }: Props) {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    return (
        <div className="grid gap-6">
            <Card>
                <CardHeader>
                    <CardTitle>Machine Efficiency</CardTitle>
                    <CardDescription>
                        Output vs Scrap metrics per machine.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {data.length === 0 ? (
                        <p className="text-muted-foreground py-8 text-center text-sm">No machine data available.</p>
                    ) : (
                        <div className="h-[400px] w-full" style={{ height: 400, minHeight: 400 }}>
                            {isMounted ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={data}
                                        margin={{
                                            top: 20,
                                            right: 30,
                                            left: 20,
                                            bottom: 5,
                                        }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="machineName" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="left" orientation="left" stroke="#8884d8" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" fontSize={12} tickLine={false} axisLine={false} unit="%" />
                                        <Tooltip />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="unitsPerHour" name="Units / Hour" fill="#8884d8" radius={[4, 4, 0, 0]} />
                                        <Bar yAxisId="right" dataKey="scrapRate" name="Scrap Rate %" fill="#82ca9d" radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full w-full flex items-center justify-center bg-muted/5 animate-pulse rounded" />
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Detailed Table */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.map((machine) => (
                    <Card key={machine.machineCode} className="overflow-hidden">
                        <div className="h-2 bg-blue-500 w-full" />
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">{machine.machineName}</CardTitle>
                            <CardDescription className="font-mono text-xs">{machine.machineCode}</CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Total Output</span>
                                <span className="font-bold text-lg">{machine.totalOutput.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Op. Hours</span>
                                <span className="font-bold">{machine.totalOperatingHours}h</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Speed</span>
                                <span className="font-medium">{machine.unitsPerHour} / hr</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Scrap Rate</span>
                                <span className={`font-bold ${machine.scrapRate > 2 ? 'text-red-600' : 'text-green-600'}`}>
                                    {machine.scrapRate}%
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
