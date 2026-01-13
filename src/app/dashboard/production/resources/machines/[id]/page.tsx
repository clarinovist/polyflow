import { MachineForm } from '@/components/production/MachineForm';
import { getLocations } from '@/actions/locations';
import { getMachineById } from '@/actions/machines';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function EditMachinePage({ params }: PageProps) {
    const { id } = await params;
    const [machine, locations] = await Promise.all([
        getMachineById(id),
        getLocations(),
    ]);

    if (!machine) {
        notFound();
    }

    return (
        <div className="p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Edit Machine</h1>
            <div className="bg-card p-6 rounded-lg border shadow-sm">
                <MachineForm initialData={machine} locations={locations} />
            </div>
        </div>
    );
}
