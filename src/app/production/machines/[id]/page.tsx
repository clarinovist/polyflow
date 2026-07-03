import { getMachineHistory } from '@/actions/production/machines';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Cog, CheckCircle2, Clock, Activity } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils/utils';
import { formatWIB } from '@/lib/utils/timezone';

export const dynamic = 'force-dynamic';

export default async function MachineHistoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const res = await getMachineHistory(id);

    if (!res.success || !res.data) {
        return (
            <div className="space-y-6">
                <Link href="/production/machines">
                    <Button variant="ghost" size="sm" className="gap-1">
                        <ArrowLeft className="h-4 w-4" /> Kembali ke Machine Board
                    </Button>
                </Link>
                <Card>
                    <CardContent className="py-10 text-center text-muted-foreground">
                        Mesin tidak ditemukan.
                    </CardContent>
                </Card>
            </div>
        );
    }

    const { machine, executions } = res.data;

    const completedExecs = executions.filter((e: { status: string }) => e.status === 'COMPLETED');
    const totalYield = completedExecs.reduce(
        (sum: number, e: { quantityProduced: unknown }) => sum + Number(e.quantityProduced || 0),
        0
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Link href="/production/machines">
                        <Button variant="ghost" size="sm" className="gap-1 mb-2 -ml-2">
                            <ArrowLeft className="h-4 w-4" /> Machine Board
                        </Button>
                    </Link>
                    <h2 className="text-3xl font-bold tracking-tight">{machine.code}</h2>
                    <p className="text-muted-foreground">
                        {machine.name} • {machine.location?.name || 'No location'}
                        <Badge
                            variant={machine.status === 'ACTIVE' ? 'outline' : 'destructive'}
                            className="ml-2 text-[9px] uppercase"
                        >
                            {machine.status}
                        </Badge>
                    </p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center text-center">
                        <Activity className="h-8 w-8 text-blue-600 opacity-80 mb-2" />
                        <div className="text-xl font-bold">{executions.length}</div>
                        <p className="text-xs text-muted-foreground">Total Runs</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-600 opacity-80 mb-2" />
                        <div className="text-xl font-bold">{completedExecs.length}</div>
                        <p className="text-xs text-muted-foreground">Completed</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center text-center">
                        <Cog className="h-8 w-8 text-amber-600 opacity-80 mb-2" />
                        <div className="text-xl font-bold">
                            {totalYield.toLocaleString('id-ID')}
                        </div>
                        <p className="text-xs text-muted-foreground">Total Yield (KG)</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 flex flex-col items-center text-center">
                        <Clock className="h-8 w-8 text-zinc-600 opacity-80 mb-2" />
                        <div className="text-xl font-bold">
                            {executions.filter((e: { status: string }) => e.status === 'IN_PROGRESS').length}
                        </div>
                        <p className="text-xs text-muted-foreground">In Progress</p>
                    </CardContent>
                </Card>
            </div>

            {/* Execution History Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Riwayat Produksi</CardTitle>
                    <CardDescription>
                        Semua eksekusi produksi yang pernah berjalan di mesin ini.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Tanggal</TableHead>
                                <TableHead>Order #</TableHead>
                                <TableHead>Produk</TableHead>
                                <TableHead>Operator</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Hasil</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {executions.map((exec: {
                                id: string;
                                startTime: string | Date | null;
                                endTime: string | Date | null;
                                status: string;
                                quantityProduced: unknown;
                                productionOrder: {
                                    orderNumber: string;
                                    bom: { name: string; productVariant: { name: string; primaryUnit: string } };
                                } | null;
                                operator: { name: string | null } | null;
                            }) => (
                                <TableRow
                                    key={exec.id}
                                    className={cn(exec.status === 'VOIDED' && 'opacity-50 line-through bg-muted/30')}
                                >
                                    <TableCell className="text-xs whitespace-nowrap">
                                        <div className="font-medium">
                                            {exec.startTime ? formatWIB(exec.startTime, 'dd MMM yyyy') : '-'}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {exec.startTime ? formatWIB(exec.startTime, 'HH:mm') : '-'}
                                            {exec.endTime ? ` - ${formatWIB(exec.endTime, 'HH:mm')}` : ''}
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs font-bold">
                                        {exec.productionOrder?.orderNumber || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm font-medium">
                                            {exec.productionOrder?.bom.productVariant.name || '-'}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                            {exec.productionOrder?.bom.name || ''}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        {exec.operator?.name || '-'}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={
                                                exec.status === 'COMPLETED'
                                                    ? 'default'
                                                    : exec.status === 'IN_PROGRESS'
                                                        ? 'outline'
                                                        : exec.status === 'VOIDED'
                                                            ? 'destructive'
                                                            : 'secondary'
                                            }
                                            className="text-[9px] uppercase"
                                        >
                                            {exec.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {exec.status === 'VOIDED' ? (
                                            <span className="text-muted-foreground">-</span>
                                        ) : (
                                            <>
                                                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                                    {Number(exec.quantityProduced || 0).toLocaleString('id-ID')}
                                                </span>
                                                <span className="text-[10px] ml-1 text-muted-foreground">
                                                    {exec.productionOrder?.bom.productVariant.primaryUnit || ''}
                                                </span>
                                            </>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {executions.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground italic">
                                        Belum ada riwayat produksi untuk mesin ini.
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
