import { PayslipsPeriodView } from '@/components/hrd/PayslipsPeriodView';
import { EntityStatusTimeline } from '@/components/shared/EntityStatusTimeline';

export default async function PayrollPeriodDetailPage({
    params,
}: {
    params: Promise<{ periodId: string }>;
}) {
    const { periodId } = await params;
    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
            <PayslipsPeriodView periodId={periodId} />
            <EntityStatusTimeline
                entityType="PayrollPeriod"
                entityId={periodId}
            />
        </div>
    );
}
