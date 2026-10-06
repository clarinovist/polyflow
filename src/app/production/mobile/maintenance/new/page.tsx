import { getMaintenanceFormData } from '@/actions/production/maintenance';
import { MobileSectionHeader } from '@/components/mobile';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { MaintenanceForm } from './form-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lapor Maintenance | PolyFlow' };

export default async function NewMaintenancePage() {
  const res = await getMaintenanceFormData();
  if (!res.success) return <MobileReadError title="Form maintenance belum tersedia" />;
  return (
    <div className="space-y-4">
      <MobileSectionHeader title="Lapor Kerusakan" level={1} />
      <p className="text-sm text-muted-foreground">Kirim laporan, Kepala Pabrik menunjuk teknisi. Spare part cukup tulis kebutuhan — dibeli saat butuh.</p>
      <MaintenanceForm machines={res.data.machines} spareCatalog={res.data.spareCatalog} locations={res.data.locations} />
    </div>
  );
}
