import { requireAuth } from '@/lib/tools/auth-checks';
import { RoleMappingClient } from '@/components/finance/coa/RoleMappingClient';
import { PageHeader } from '@/components/ui/page-header';

export const metadata = {
    title: 'Role Mapping | Polyflow Finance',
    description: 'Configure which GL account each semantic role maps to.',
};

export default async function RoleMappingPage() {
    await requireAuth();

    return (
        <div className="space-y-6 pb-20">
            <PageHeader
                title="Account Role Mapping"
                description="Configure which GL account each semantic role uses for this tenant."
            />
            <RoleMappingClient />
        </div>
    );
}
