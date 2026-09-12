import { AccountListClient } from '@/components/finance/coa/AccountListClient';
import { getAccounts } from '@/actions/finance/account-actions';
import { COAAuditTool } from '@/components/finance/COAAuditTool';

export default async function CoaPage() {
    const accountsRes = await getAccounts();
    const accounts =
        accountsRes.success && accountsRes.data ? accountsRes.data : [];

    return (
        <div className="space-y-6">
            <h1 className="sr-only">Bagan Akun</h1>
            <AccountListClient initialAccounts={accounts} />

            <div className="mt-8 pt-8 border-t">
                <h2 className="text-lg font-semibold mb-4">
                    Pemeriksaan Integritas
                </h2>
                <COAAuditTool />
            </div>
        </div>
    );
}
