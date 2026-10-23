import { MobileReadError } from '@/components/mobile/MobileReadError';
import { PageHeader } from '@/components/ui/page-header';
import { getFgDemandBoard, getInitData } from '@/actions/production/production';
import { ProductionRequestsClient } from '@/components/production/ProductionRequestsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
    title: 'Permintaan Barang Jadi | PolyFlow',
    description: 'Item FG yang perlu diproduksi berdasarkan Sales Order aktif.',
};

export default async function ProductionRequestsPage() {
    const [demandRes, initRes] = await Promise.all([
        getFgDemandBoard(),
        getInitData(),
    ]);

    if (!demandRes.success || !demandRes.data || !initRes.success || !initRes.data) {
        return <MobileReadError title="Permintaan barang jadi gagal dimuat" />;
    }

    const rows = demandRes.success && demandRes.data ? demandRes.data : [];
    const machines =
        initRes.success && initRes.data?.machines ? initRes.data.machines : [];
    const locations =
        initRes.success && initRes.data?.locations
            ? initRes.data.locations
            : [];

    return (
        <div className="min-w-0 space-y-6">
            <PageHeader title="Permintaan Barang Jadi" description="Kebutuhan produksi berdasarkan pesanan penjualan aktif." />
            <ProductionRequestsClient
                rows={rows}
                machines={machines}
                locations={locations}
            />
        </div>
    );
}
