import { getSimulationData } from '@/actions/finance/simulator';

import SimulatorClient from './SimulatorClient';

export const dynamic = 'force-dynamic';

export default async function CostingSimulatorPage() {
    const simulationDataResult = await getSimulationData();

    if (!simulationDataResult.success) {
        throw new Error(simulationDataResult.error);
    }

    return <SimulatorClient initialData={simulationDataResult.data ?? { materials: [], boms: [] }} />;
}