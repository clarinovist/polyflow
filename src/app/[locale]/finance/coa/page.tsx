import { AccountListClient } from "@/components/finance/coa/AccountListClient";
import { getAccounts } from "@/actions/finance/account-actions";
import { COAAuditTool } from "@/components/finance/COAAuditTool";

export default async function CoaPage() {
    const accounts = await getAccounts();

    return (
        <div className="space-y-6">
            <AccountListClient initialAccounts={accounts} />

            <div className="mt-8 pt-8 border-t">
                <h3 className="text-lg font-semibold mb-4">Integrity Check</h3>
                <COAAuditTool />
            </div>
        </div>
    );
}
