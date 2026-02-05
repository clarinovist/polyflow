import { MachineForm } from '@/components/production/MachineForm';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';

export default async function CreateMachinePage() {
    const locations = await prisma.location.findMany({
        orderBy: { name: 'asc' }
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Register New Machine</h1>
                <p className="text-muted-foreground mt-1">
                    Add a new piece of equipment to your production fleet.
                </p>
            </div>

            <Card className="bg-background/40 backdrop-blur-xl border-white/10 dark:border-white/5 shadow-xl">
                <CardHeader>
                    <CardTitle>Machine Specifications</CardTitle>
                    <CardDescription>Fill in the technical details and location assignment.</CardDescription>
                </CardHeader>
                <CardContent>
                    <MachineForm locations={locations} />
                </CardContent>
            </Card>
        </div>
    );
}
