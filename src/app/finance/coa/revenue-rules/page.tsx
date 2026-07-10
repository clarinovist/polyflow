import { requireAuth } from '@/lib/tools/auth-checks';
import { PageHeader } from '@/components/ui/page-header';
import { RevenueRulesClient } from '@/components/finance/coa/RevenueRulesClient';

export const metadata = {
    title: 'Revenue Rules | Polyflow Finance',
    description: 'Configure variant/product name → revenue account rules.',
};

export default async function RevenueRulesPage() {
    await requireAuth();

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Revenue Rules"
                description="Configure which GL account each product/variant family maps to for sales invoices."
            />
            <RevenueRulesClient />
        </div>
    );
}
