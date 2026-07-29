import { listRoutes } from '@/actions/production/production-routings';
import { RoutingListClient } from '@/components/production/routing/RoutingListClient';

export default async function RoutingsPage() {
  const result = await listRoutes();
  const routes = result.success && result.data ? result.data : [];

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Routing Produksi</h1>
        <p className="text-sm text-muted-foreground">Urutan proses per product variant</p>
      </div>
      <RoutingListClient initialRoutes={routes} />
    </div>
  );
}
