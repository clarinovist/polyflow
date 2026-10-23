import { MobileReadError } from '@/components/mobile/MobileReadError';
import { PageHeader } from '@/components/ui/page-header';
import { listProductionRuns } from '@/actions/production/production-runs';
import { RunsListClient } from '@/components/production/runs/RunsListClient';

export default async function RunsPage() {
  const result = await listProductionRuns();
  if (!result.success || !result.data) return <MobileReadError title="Rangkaian produksi gagal dimuat" />;
  const runs = result.success && result.data ? result.data : [];
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Rangkaian Produksi" description="Satu rangkaian menghasilkan beberapa SPK sesuai tahap routing." />
      <RunsListClient initialRuns={runs} />
    </div>
  );
}
