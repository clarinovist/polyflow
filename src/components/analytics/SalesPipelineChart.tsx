import { analyticsLabels } from '@/lib/labels';
import { SalesPipelineSummary } from '@/types/analytics';
import { StatusDistributionChart } from './StatusDistributionChart';

interface SalesPipelineChartProps {
    data: SalesPipelineSummary[];
}

const PIPELINE_COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#10b981', '#ef4444'];

export function SalesPipelineChart({ data }: SalesPipelineChartProps) {
    return (
        <StatusDistributionChart
            title={analyticsLabels.salesPipeline}
            description={analyticsLabels.salesPipelineDesc}
            data={data}
            colors={PIPELINE_COLORS}
        />
    );
}
