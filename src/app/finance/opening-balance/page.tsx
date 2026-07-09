import { requireAuth } from '@/lib/tools/auth-checks';
import { getCustomers } from '@/actions/sales/customer';
import { getSuppliers } from '@/actions/purchasing/supplier';
import { OpeningBalanceSpreadsheet } from '@/components/finance/OpeningBalanceSpreadsheet';
import { getAccountsForOpeningBalance } from '@/actions/finance/opening-balance';
import { Separator } from '@/components/ui/separator';
import { resolveAccount } from '@/services/accounting/account-resolver';

export default async function OpeningBalancePage() {
    await requireAuth();

    // Fetch data in parallel
    const [accountsRes, customersRes, suppliersRes, arResolved, apResolved] = await Promise.all([
        getAccountsForOpeningBalance(),
        getCustomers(),
        getSuppliers(),
        resolveAccount('accounts-receivable').catch(() => null),
        resolveAccount('accounts-payable').catch(() => null),
    ]);

    // Serialize Decimal objects if any (though these simple selects might not need it, it's safer)
    const customers = customersRes.success && customersRes.data ? customersRes.data : [];
    const suppliers = suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];
    const accounts = accountsRes.success && accountsRes.data ? accountsRes.data : [];

    return (
        <div className="container mx-auto py-8 max-w-7xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">Opening Balance Setup</h1>
                <p className="text-muted-foreground mt-2">
                    Set up your initial account balances and outstanding invoices for a complete migration.
                </p>
            </div>

            <OpeningBalanceSpreadsheet
                accounts={accounts}
                customers={customers}
                suppliers={suppliers}
                arAccountId={arResolved?.id}
                apAccountId={apResolved?.id}
            />

            <Separator className="my-12" />

            <div className="bg-muted/30 p-6 rounded-lg border border-dashed">
                <h3 className="font-semibold mb-2">Need to see previous entries?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                    The history view has been moved to the &quot;Journal Entries&quot; page for better auditability.
                    Look for entries with reference &quot;OPENING-GEN&quot; or specific Invoice numbers.
                </p>
            </div>
        </div>
    );
}
