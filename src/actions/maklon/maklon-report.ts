'use server';

import { withTenant } from '@/lib/core/tenant';
import { MaklonReportService } from '@/services/maklon/maklon-report-service';
import { serializeData } from '@/lib/utils/utils';

export const getMaklonReport = withTenant(async function getMaklonReport(filters?: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
}) {
    try {
        const report = await MaklonReportService.getReport({
            startDate: filters?.startDate ? new Date(filters.startDate) : undefined,
            endDate: filters?.endDate ? new Date(filters.endDate) : undefined,
            customerId: filters?.customerId || undefined,
        });
        return { success: true, data: serializeData(report) };
    } catch {
        return {
            success: false,
            error: 'Gagal memuat laporan Maklon',
        };
    }
});

export const getMaklonCustomers = withTenant(async function getMaklonCustomers() {
    try {
        const customers = await MaklonReportService.getCustomers();
        return { success: true, data: customers };
    } catch {
        return {
            success: false,
            error: 'Gagal memuat laporan Maklon',
        };
    }
});
