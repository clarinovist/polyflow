import { getMachines } from '@/actions/machines';
import { Card, CardContent } from '@/components/ui/card';
import { Settings2, Plus, Search, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import Link from 'next/link';
import { MachineActions } from '@/components/production/MachineActions';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MachineStatus } from '@prisma/client';

export default async function MachinesPage({
    searchParams,
}: {
    searchParams: Promise<{ status?: string }>;
}) {
    const params = await searchParams;
    const statusParam = params.status;
    const isValidStatus = statusParam && Object.values(MachineStatus).includes(statusParam as MachineStatus);

    const result = await getMachines();

    if (!result.success) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed rounded-xl p-8 text-center bg-muted/5">
                <AlertCircle className="h-12 w-12 text-destructive mb-4 animate-pulse" />
                <h3 className="text-xl font-bold text-foreground">Failed to Load Fleet</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                    {result.error}
                </p>
                <Button variant="outline" className="mt-6" onClick={() => window.location.reload()}>
                    Try Again
                </Button>
            </div>
        );
    }

    const allMachines = result.data || [];
    const currentStatus = statusParam || 'all';

    // Filter by status if applicable
    const filteredByStatus = isValidStatus
        ? allMachines.filter(m => m.status === statusParam)
        : allMachines;

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Machines & Equipment</h1>
                    <p className="text-muted-foreground mt-1">
                        Configure your production fleet and maintenance status.
                    </p>
                </div>
                <Link href="/dashboard/machines/create">
                    <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Register Machine
                    </Button>
                </Link>
            </div>

            <Tabs defaultValue={currentStatus} className="w-full">
                <TabsList className="mb-4">
                    <Link href="/dashboard/machines"><TabsTrigger value="all">All Fleet</TabsTrigger></Link>
                    <Link href="/dashboard/machines?status=ACTIVE"><TabsTrigger value="ACTIVE">Active</TabsTrigger></Link>
                    <Link href="/dashboard/machines?status=MAINTENANCE"><TabsTrigger value="MAINTENANCE">Maintenance</TabsTrigger></Link>
                </TabsList>

                <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 overflow-hidden shadow-xl">
                    <CardContent className="p-0">
                        <div className="p-4 bg-muted/10 border-b border-white/5">
                            <div className="relative max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Search machines..." className="pl-9 bg-background/50 h-9 text-sm" />
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                        <TableHead className="pl-6">Machine Detail</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right pr-6">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredByStatus.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                                No machines found for this status.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredByStatus.map((machine) => (
                                            <TableRow key={machine.id} className="group border-white/5 hover:bg-primary/[0.02] transition-colors">
                                                <TableCell className="pl-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-white/5">
                                                            <Settings2 className="h-5 w-5 text-primary" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-sm tracking-tight text-foreground truncate max-w-[200px]">
                                                                {machine.name}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground font-medium">
                                                                {machine.type.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-white/5">
                                                        {machine.code}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-[11px] font-semibold text-muted-foreground">
                                                        {machine.location?.name || 'Unknown'}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={machine.status === 'ACTIVE'
                                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10 text-[10px] h-5 font-bold"
                                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/10 text-[10px] h-5 font-bold"
                                                    }>
                                                        {machine.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right pr-6">
                                                    <MachineActions id={machine.id} name={machine.name} />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </Tabs>
        </div>
    );
}
