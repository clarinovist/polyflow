import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { History, CheckCircle2, Package, Clock } from 'lucide-react';
import { VoidExecutionButton } from '@/components/production/VoidExecutionButton';

export const dynamic = 'force-dynamic';

export default async function ProductionHistoryPage() {
    const completions = await prisma.productionExecution.findMany({
        where: { endTime: { not: null } },
        include: {
            productionOrder: {
                include: {
                    bom: {
                        include: { productVariant: true }
                    }
                }
            },
            operator: true,
            machine: true
        },
        orderBy: { endTime: 'desc' },
        take: 30
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Output Logs</h2>
                    <p className="text-muted-foreground">Historical record of production completions and yield.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                    { label: "Completed Today", value: "24 Jobs", icon: CheckCircle2, color: "text-emerald-600" },
                    { label: "Total Yield (KG)", value: "12,450", icon: Package, color: "text-blue-600" },
                    { label: "Avg Cycle Time", value: "2.4 hrs", icon: Clock, color: "text-amber-600" },
                    { label: "Records", value: completions.length.toString(), icon: History, color: "text-zinc-600" },
                ].map((stat) => (
                    <Card key={stat.label}>
                        <CardContent className="pt-4 flex flex-col items-center justify-center text-center">
                            <stat.icon className={`h-8 w-8 ${stat.color} opacity-80 mb-2`} />
                            <div className="text-xl font-bold">{stat.value}</div>
                            <p className="text-xs text-muted-foreground">{stat.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date / Time</TableHead>
                                <TableHead>Order #</TableHead>
                                <TableHead>Product</TableHead>
                                <TableHead>Machine</TableHead>
                                <TableHead>Operator</TableHead>
                                <TableHead className="text-right">Yield</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {completions.map((exec) => (
                                <TableRow key={exec.id}>
                                    <TableCell className="text-xs whitespace-nowrap">
                                        <div className="font-medium">{exec.endTime ? format(new Date(exec.endTime), 'MMM dd, HH:mm') : '-'}</div>
                                        <div className="text-[10px] text-muted-foreground">{exec.startTime ? format(new Date(exec.startTime), 'HH:mm') : '-'} started</div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs font-bold">{exec.productionOrder.orderNumber}</TableCell>
                                    <TableCell>
                                        <div className="text-sm font-medium">{exec.productionOrder.bom.productVariant.name}</div>
                                        <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">{exec.productionOrder.bom.name}</div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-[10px] bg-zinc-50 dark:bg-zinc-900/50 dark:border-zinc-800">{exec.machine?.code || 'N/A'}</Badge>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {exec.operator?.name || 'Automated'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                            {Number(exec.quantityProduced || 0).toLocaleString()}
                                        </span>
                                        <span className="text-[10px] ml-1 text-muted-foreground">{exec.productionOrder.bom.productVariant.primaryUnit}</span>
                                    </TableCell>
                                    <TableCell>
                                        <VoidExecutionButton
                                            executionId={exec.id}
                                            productionOrderId={exec.productionOrderId}
                                            orderNumber={exec.productionOrder.orderNumber}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {completions.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground italic">
                                        No historical production records found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
