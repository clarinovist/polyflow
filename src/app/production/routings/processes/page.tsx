import { listProcesses, listMachineCapabilities } from '@/actions/production/production-routings';
import { ProcessListClient } from '@/components/production/routing/ProcessListClient';

export default async function ProcessPage() {
  const [procRes, capRes] = await Promise.all([listProcesses(), listMachineCapabilities()]);
  const processes = procRes.success && procRes.data ? procRes.data : [];
  const caps = capRes.success && capRes.data ? capRes.data : [];
  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Proses & Kapabilitas</h1>
        <p className="text-sm text-muted-foreground">Master proses produksi — MIXING, EXTRUSION, PACKING, STERILIZATION, dan INJECTION tanpa menambah enum</p>
      </div>
      <ProcessListClient initialProcesses={processes} initialCapabilities={caps} />
    </div>
  );
}
