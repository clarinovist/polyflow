import { PageHeader } from '@/components/ui/page-header';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { listRoutes } from '@/actions/production/production-routings';
import { RoutingListClient } from '@/components/production/routing/RoutingListClient';

export default async function RoutingsPage() {
    const result = await listRoutes();
    if (!result.success || !result.data) return <MobileReadError title="Routing produksi gagal dimuat" />;
    const routes = result.success && result.data ? result.data : [];

    return (
        <div className="flex min-w-0 flex-col gap-6">
            <PageHeader title="Routing Produksi" description="Urutan proses per varian produk." />
            <RoutingListClient initialRoutes={routes} />
        </div>
    );
}
