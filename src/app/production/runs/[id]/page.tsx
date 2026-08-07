import { getProductionRun } from '@/actions/production/production-runs';
import { RunDetailClient } from '@/components/production/runs/RunDetailClient';
import { notFound } from 'next/navigation';

export default async function RunDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const result = await getProductionRun(id);
    if (!result.success || !result.data) notFound();
    return (
        <div className="p-4 md:p-6">
            <RunDetailClient initialRun={result.data as never} />
        </div>
    );
}
