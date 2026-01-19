import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MachinePerformanceItem } from "@/types/analytics";
import { Activity } from "lucide-react";

interface MachinePerformanceCardProps {
    data: MachinePerformanceItem[];
}

export function MachinePerformanceCard({ data }: MachinePerformanceCardProps) {
    const topMachines = data.sort((a, b) => b.unitsPerHour - a.unitsPerHour).slice(0, 5);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-md font-medium">Machine Efficiency</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {topMachines.map((machine) => (
                        <div key={machine.machineCode} className="flex items-center">
                            <div className="flex-1 space-y-1">
                                <p className="text-sm font-medium leading-none">{machine.machineName}</p>
                                <p className="text-xs text-muted-foreground">
                                    {machine.totalOperatingHours} hrs | {machine.scrapRate}% scrap
                                </p>
                            </div>
                            <div className="font-bold">
                                {machine.unitsPerHour.toFixed(0)} <span className="text-xs font-normal text-muted-foreground">u/hr</span>
                            </div>
                        </div>
                    ))}
                    {topMachines.length === 0 && (
                        <p className="text-sm text-muted-foreground">No machine data available.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
