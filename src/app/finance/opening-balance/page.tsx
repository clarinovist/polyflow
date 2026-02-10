import { requireAuth } from '@/lib/auth-checks';
import { prisma } from '@/lib/prisma';
import { OpeningBalanceSpreadsheet } from '@/components/finance/OpeningBalanceSpreadsheet';
import { getAccountsForOpeningBalance } from '@/actions/finance/opening-balance';
import { Separator } from '@/components/ui/separator';
import { serializeData } from '@/lib/utils';

export default async function OpeningBalancePage() {
    await requireAuth();

    // Fetch data in parallel
    const [accounts, customersData, suppliersData] = await Promise.all([
        getAccountsForOpeningBalance(),
        prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
        prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
    ]);

    // Serialize Decimal objects if any (though these simple selects might not need it, it's safer)
    const customers = serializeData(customersData);
    const suppliers = serializeData(suppliersData);

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
