'use server';

import { AnalyticsService, SalesMetrics, ProductionAnalyticsData } from '@/services/analytics-service';
import { DateRange } from '@/types/analytics';

export async function getSalesMetrics(days: number = 30): Promise<SalesMetrics> {
    return await AnalyticsService.getSalesMetrics(days);
}

export async function getProductionAnalytics(dateRange?: DateRange): Promise<ProductionAnalyticsData> {
    return await AnalyticsService.getProductionAnalytics(dateRange);
}

// Export types for UI usage if needed
export type { SalesMetrics } from '@/services/analytics-service';
export type { ProductionAnalyticsData } from '@/services/analytics-service';
