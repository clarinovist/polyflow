import {
    listTeamVisits,
    getTeamComplianceSummary,
} from '@/actions/sales/visit-supervision';
import { getCustomers } from '@/actions/sales/customer';
import { PageHeader } from '@/components/ui/page-header';
import { serializeData } from '@/lib/utils/utils';
import { VisitMonitorClient } from './VisitMonitorClient';

function getDefaultRange() {
    const now = new Date();
    const to = now.toISOString().split('T')[0];
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 7);
    const from = fromDate.toISOString().split('T')[0];
    return { from, to };
}

export default async function SalesVisitsPage() {
    const { from, to } = getDefaultRange();

    const [visitsRes, complianceRes, customersRes] = await Promise.all([
        listTeamVisits({
            from: new Date(from),
            to: new Date(to + 'T23:59:59.999Z'),
            page: 1,
            pageSize: 50,
        }),
        getTeamComplianceSummary(from, to + 'T23:59:59.999Z'),
        getCustomers().catch(() => null),
    ]);

    const visitsData =
        visitsRes?.success && visitsRes.data
            ? serializeData(visitsRes.data)
            : { visits: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };

    const complianceData =
        complianceRes?.success && complianceRes.data
            ? serializeData(complianceRes.data)
            : [];

    const customers =
        customersRes?.success && customersRes.data
            ? serializeData(customersRes.data)
            : [];

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6">
            <PageHeader
                title="Kunjungan Lapangan"
                description="Monitoring kunjungan tim sales, kepatuhan rute, dan review extra call."
            />
            <VisitMonitorClient
                initialVisits={visitsData}
                initialCompliance={complianceData}
                initialFrom={from}
                initialTo={to}
                customers={customers}
            />
        </div>
    );
}
