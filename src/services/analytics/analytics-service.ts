import { DateRange } from '@/types/analytics';

import { getProductionAnalytics, type ProductionAnalyticsData } from './production-analytics-service';
import { getSalesMetrics, type SalesMetrics } from './sales-metrics-service';

export class AnalyticsService {
    static async getSalesMetrics(dateRange?: DateRange): Promise<SalesMetrics> {
        return getSalesMetrics(dateRange);
    }

    static async getProductionAnalytics(dateRange?: DateRange): Promise<ProductionAnalyticsData> {
        return getProductionAnalytics(dateRange);
    }
}

export type { ProductionAnalyticsData, SalesMetrics };
export { getProductionAnalytics, getSalesMetrics };
