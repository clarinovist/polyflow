import { getWarehouseMobileDashboard } from '@/actions/dashboard/warehouse-mobile-dashboard';
import { MobileReadError } from '@/components/mobile';
import { WarehouseMobileHomeClient } from './WarehouseMobileHomeClient';

export default async function WarehouseMobilePage() {
    const result = await getWarehouseMobileDashboard();
    if (!result.success) {
        return <MobileReadError title="Ringkasan gudang belum tersedia" />;
    }

    return <WarehouseMobileHomeClient data={result.data} />;
}
