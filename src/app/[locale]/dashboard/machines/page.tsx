import { getMachines } from '@/actions/machines';
import { Machine } from '@prisma/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings2, Plus, Search } from 'lucide-react';
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

export default async function MachinesPage() {
    const machines = await getMachines().catch(() => []);

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                        Machines & Equipment
                    </h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Configure your production fleet and maintenance status.
                    </p>
                </div>
                <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/20 border-0">
                    <Plus className="h-4 w-4 mr-2" />
                    Register Machine
                </Button>
            </div>

            <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 overflow-hidden shadow-xl">
                <CardHeader className="bg-muted/20 border-b border-white/10">
                    <CardTitle className="text-xl font-bold">Fleet Overview</CardTitle>
                    <CardDescription>All registered production machines across all locations.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="p-4 bg-muted/10 border-b border-white/5">
                        <div className="relative max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search machines..." className="pl-9 bg-background/50" />
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent border-white/10 text-[11px] font-bold uppercase tracking-wider">
                                    <TableHead>Machine Name</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {machines.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                                            No machines registered yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    machines.map((machine: Machine & { location?: { name: string } | null }) => (
                                        <TableRow key={machine.id} className="group border-white/5 hover:bg-primary/[0.02]">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                                        <Settings2 className="h-4 w-4 text-primary" />
                                                    </div>
                                                    <span className="font-bold text-sm tracking-tight">{machine.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-[10px] font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                                                    {machine.code}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                    <span>{machine.location?.name || 'Unknown Location'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={machine.status === 'ACTIVE' ? 'default' : 'secondary'} className={machine.status === 'ACTIVE' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/10 text-[10px] h-5 font-bold" : "text-[10px] h-5 font-bold"}>
                                                    {machine.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                                                    <Settings2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
