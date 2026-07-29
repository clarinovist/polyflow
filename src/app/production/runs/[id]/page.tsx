import { getProductionRun } from '@/actions/production/production-runs';
import { RunDetailClient } from '@/components/production/runs/RunDetailClient';
import { notFound } from 'next/navigation';

export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const result = await getProductionRun(params.id);
  if (!result.success || !result.data) notFound();
  return (
    <div className="p-4 md:p-6">
      <RunDetailClient initialRun={result.data as never} />
    </div>
  );
}
