'use server';

import { withTenant } from "@/lib/core/tenant";
import { AnalyticsService } from '@/services/analytics/analytics-service';
import { DateRange } from '@/types/analytics';
import { format } from 'date-fns';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';

export const getSalesMetrics = withTenant(
async function getSalesMetrics(dateRange?: DateRange) {
    return safeAction(async () => {
        return await AnalyticsService.getSalesMetrics(dateRange);
    });
}
);

export const getProductionAnalytics = withTenant(
async function getProductionAnalytics(dateRange?: DateRange) {
    return safeAction(async () => {
        return await AnalyticsService.getProductionAnalytics(dateRange);
    });
}
);

export const exportSalesAnalytics = withTenant(
async function exportSalesAnalytics(dateRange: DateRange) {
    return safeAction(async () => {
        try {
            const metrics = await AnalyticsService.getSalesMetrics(dateRange);

            const data = [
                ['Sales Analytics Report', '', ''],
                ['Range:', format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd')],
                [''],
                ['Total Revenue', metrics.totalRevenue],
                ['Total Orders', metrics.totalOrders],
                ['Avg Order Value', metrics.averageOrderValue],
                [''],
                ['Top Products', 'Quantity', 'Revenue'],
                ...metrics.topProducts.map(p => [p.name, p.quantity, p.revenue]),
                [''],
                ['Top Customers', 'Orders', 'Revenue'],
                ...metrics.topCustomers.map(c => [c.name, c.salesCount, c.revenue])
            ];

            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, "Sales Analytics");

            const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            return buf;
        } catch (error: unknown) {
            throw new BusinessRuleError(error instanceof Error ? error.message : "Unknown error");
        }
    });
}
);

export const exportProductionAnalytics = withTenant(
async function exportProductionAnalytics(dateRange: DateRange) {
    return safeAction(async () => {
        try {
            const data = await AnalyticsService.getProductionAnalytics(dateRange);

            const realizationData = [
                ['Production Realization Report'],
                ['Order Number', 'Product', 'Planned Qty', 'Actual Qty', 'Yield %', 'Schedule'],
                ...data.realization.map(r => [
                    r.orderNumber,
                    r.productName,
                    r.plannedQuantity,
                    r.actualQuantity,
                    r.yieldRate.toFixed(2),
                    r.scheduleAdherence
                ])
            ];

            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            const ws1 = XLSX.utils.aoa_to_sheet(realizationData);
            XLSX.utils.book_append_sheet(wb, ws1, "Realization");

            // Add Quality sheet
            const qualityData = [
                ['Quality Control Summary'],
                ['Total Inspections', data.quality.inspections.total],
                ['Pass', data.quality.inspections.pass],
                ['Fail', data.quality.inspections.fail],
                ['Pass Rate %', data.quality.inspections.passRate.toFixed(2)],
                [''],
                ['Scrap by Reason', 'Quantity', 'Percentage %'],
                ...data.quality.scrapByReason.map(s => [s.reason, s.quantity, s.percentage.toFixed(2)])
            ];
            const ws2 = XLSX.utils.aoa_to_sheet(qualityData);
            XLSX.utils.book_append_sheet(wb, ws2, "Quality");

            const buf = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            return buf;
        } catch (error: unknown) {
            throw new BusinessRuleError(error instanceof Error ? error.message : "Unknown error");
        }
    });
}
);

export type { SalesMetrics } from '@/services/analytics/analytics-service';
export type { ProductionAnalyticsData } from '@/services/analytics/analytics-service';
