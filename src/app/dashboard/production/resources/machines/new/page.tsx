import { MachineForm } from '@/components/production/MachineForm';
import { getLocations } from '@/actions/locations';

export default async function NewMachinePage() {
    const locations = await getLocations();

    return (
        <div className="p-8 max-w-2xl">
            <h1 className="text-2xl font-bold text-slate-900 mb-6">Add New Machine</h1>
            <div className="bg-white p-6 rounded-lg border shadow-sm">
                <MachineForm locations={locations} />
            </div>
        </div>
    );
}
