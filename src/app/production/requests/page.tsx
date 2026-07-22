import { getFgDemandBoard, getInitData } from '@/actions/production/production';
import { ProductionRequestsClient } from '@/components/production/ProductionRequestsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Papan Permintaan FG | PolyFlow',
    description: 'Item FG yang perlu diproduksi berdasarkan Sales Order aktif.',
};

export default async function ProductionRequestsPage() {
    const [demandRes, initRes] = await Promise.all([
        getFgDemandBoard(),
        getInitData(),
    ]);

    const rows = demandRes.success && demandRes.data ? demandRes.data : [];
    const machines = initRes.success && initRes.data?.machines ? initRes.data.machines : [];
    const locations = initRes.success && initRes.data?.locations ? initRes.data.locations : [];

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">Papan Permintaan FG</h1>
            <ProductionRequestsClient
                rows={rows}
                machines={machines}
                locations={locations}
            />
        </div>
    );
}
