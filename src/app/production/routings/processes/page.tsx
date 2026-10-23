import { PageHeader } from '@/components/ui/page-header';
import { MobileReadError } from '@/components/mobile/MobileReadError';
import { listProcesses, listMachineCapabilities } from '@/actions/production/production-routings';
import { ProcessListClient } from '@/components/production/routing/ProcessListClient';

export default async function ProcessPage() {
  const [procRes, capRes] = await Promise.all([listProcesses(), listMachineCapabilities()]);
  if (!procRes.success || !procRes.data || !capRes.success || !capRes.data) return <MobileReadError title="Proses dan kapabilitas gagal dimuat" />;
  const processes = procRes.success && procRes.data ? procRes.data : [];
  const caps = capRes.success && capRes.data ? capRes.data : [];
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader title="Proses & Kapabilitas" description="Kelola proses produksi dan kemampuan mesin." />
      <ProcessListClient initialProcesses={processes} initialCapabilities={caps} />
    </div>
  );
}
