import { analyticsLabels } from '@/lib/labels';
import { PurchaseByStatusItem } from '@/types/analytics';
import { StatusDistributionChart } from './StatusDistributionChart';

interface PurchaseStatusChartProps {
    data: PurchaseByStatusItem[];
}

export function PurchaseStatusChart({ data }: PurchaseStatusChartProps) {
    return (
        <StatusDistributionChart
            title={analyticsLabels.purchaseOrderStatus}
            description={analyticsLabels.purchaseOrderStatusDesc}
            data={data}
        />
    );
}
