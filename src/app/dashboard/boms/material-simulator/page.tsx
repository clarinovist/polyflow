import { getSimulationData } from '@/actions/finance/simulator';
import SimulatorClient from '@/app/finance/costing/simulator/SimulatorClient';

export const dynamic = 'force-dynamic';

export default async function BomMaterialSimulatorPage() {
    const simulationDataResult = await getSimulationData();

    if (!simulationDataResult.success) {
        throw new Error(simulationDataResult.error);
    }

    return (
        <SimulatorClient
            initialData={simulationDataResult.data ?? { materials: [], boms: [] }}
            backHref="/dashboard/boms"
            backLabel="Back to BOMs"
        />
    );
}
