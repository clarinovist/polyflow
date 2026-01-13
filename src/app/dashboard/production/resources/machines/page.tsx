import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, MapPin } from 'lucide-react';
import Link from 'next/link';
import { getMachines } from '@/actions/machines';
import { MachineActions } from '@/components/production/MachineActions';
import { Badge } from '@/components/ui/badge';
import { MachineStatus } from '@prisma/client';

export default async function MachinesPage() {
    const machines = await getMachines();

    return (
        <div className="p-8 space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h1 className="text-3xl font-bold text-foreground">Machines</h1>
                    <p className="text-muted-foreground">Manage production machinery and equipment</p>
                </div>
                <Link href="/dashboard/production/resources/machines/new">
                    <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Machine
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {machines.map((machine) => (
                    <Card key={machine.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-lg font-medium">
                                {machine.name}
                            </CardTitle>
                            <MachineStatusBadge status={machine.status} />
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div className="flex items-center text-sm text-muted-foreground">
                                    <span className="font-mono bg-muted px-2 py-1 rounded text-foreground mr-2">
                                        {machine.code}
                                    </span>
                                    <span className="capitalize">{machine.type.toLowerCase()}</span>
                                </div>

                                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <MapPin className="h-3 w-3" />
                                    {machine.location.name}
                                </div>

                                <div className="flex justify-end pt-2 border-t">
                                    <MachineActions id={machine.id} name={machine.name} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {machines.length === 0 && (
                    <div className="col-span-full text-center py-12 border rounded-lg bg-muted text-muted-foreground">
                        No machines found. Create one to get started.
                    </div>
                )}
            </div>
        </div>
    );
}

function MachineStatusBadge({ status }: { status: MachineStatus }) {
    const styles: Record<MachineStatus, string> = {
        ACTIVE: 'bg-emerald-100 text-emerald-700',
        MAINTENANCE: 'bg-amber-100 text-amber-700',
        BROKEN: 'bg-red-100 text-red-700',
    };

    return (
        <Badge variant="secondary" className={styles[status]}>
            {status}
        </Badge>
    );
}
