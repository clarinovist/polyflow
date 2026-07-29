import { listProductionRuns } from '@/actions/production/production-runs';
import { RunsListClient } from '@/components/production/runs/RunsListClient';

export default async function RunsPage() {
  const result = await listProductionRuns();
  const runs = result.success && result.data ? result.data : [];
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Production Runs</h1>
        <p className="text-sm text-muted-foreground">Rangkaian produksi — satu run menghasilkan beberapa SPK</p>
      </div>
      <RunsListClient initialRuns={runs} />
    </div>
  );
}
