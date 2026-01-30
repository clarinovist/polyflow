import { getMachineById } from '@/actions/machines';
import { MachineForm } from '@/components/production/MachineForm';
import { Card, CardContent } from '@/components/ui/card';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';

interface EditMachinePageProps {
    params: Promise<{ id: string }>;
}

export default async function EditMachinePage({ params }: EditMachinePageProps) {
    const { id } = await params;
    const result = await getMachineById(id);
    const locations = await prisma.location.findMany({
        orderBy: { name: 'asc' }
    });

    if (!result.success || !result.data) {
        notFound();
    }

    const machine = result.data;

    // Convert decimal to number for the form
    const machineData = {
        ...machine,
        costPerHour: machine.costPerHour ? Number(machine.costPerHour) : 0,
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit Machine Details</h1>
                <p className="text-muted-foreground mt-1">
                    Update configuration for {machine.name}.
                </p>
            </div>

            <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl border-0 overflow-hidden">
                <CardContent className="pt-6">
                    <MachineForm initialData={machineData as unknown as Parameters<typeof MachineForm>[0]['initialData']} locations={locations} />
                </CardContent>
            </Card>
        </div>
    );
}
