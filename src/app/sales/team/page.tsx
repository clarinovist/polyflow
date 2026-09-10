import { SalesTeamListClient } from '@/components/sales/SalesTeamListClient';
import { requireSalesManager } from '@/lib/auth/sales-access';
import { withTenant } from '@/lib/core/tenant';

export default async function SalesTeamPage() {
    const authorize = withTenant(async function authorize() {
        await requireSalesManager();
    });
    await authorize();
    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">
                    Daftar Sales
                </h1>
                <p className="text-muted-foreground">
                    Kelola tim sales dan assignment customer.
                </p>
            </div>
            <SalesTeamListClient />
        </div>
    );
}
