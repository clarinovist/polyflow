import { requireAuth } from '@/lib/tools/auth-checks';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueRulesClient } from '@/components/finance/coa/RevenueRulesClient';

export const metadata = {
    title: 'Revenue Rules | Polyflow Finance',
    description:
        'Configure variant name / exact product / SKU prefix → revenue account rules.',
};

export default async function RevenueRulesPage() {
    await requireAuth();

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Revenue Rules"
                description="Map each product/variant family to a GL account for sales-invoice revenue. Matchers: variant name contains, exact product name, or SKU prefix."
            />
            <RevenueRulesClient />
        </div>
    );
}
