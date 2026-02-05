import { Suspense } from 'react';
import { getCustomers } from '@/actions/customer';
import { getSuppliers } from '@/actions/supplier';
import { OpeningBalanceForm } from '@/components/finance/OpeningBalanceForm';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { serializeData } from '@/lib/utils';

export default async function OpeningBalancePage() {
    const [customersData, suppliersData] = await Promise.all([
        getCustomers(),
        getSuppliers()
    ]);

    // Serialize Decimal objects for Client Components
    const customers = serializeData(customersData);
    const suppliers = serializeData(suppliersData);

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Opening Balance Setup</h1>
            <p className="text-muted-foreground mb-8">
                Record your initial outstanding invoices for Accounts Receivable and Payable.
            </p>

            <Suspense fallback={
                <Card>
                    <CardContent className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </CardContent>
                </Card>
            }>
                <OpeningBalanceForm customers={customers} suppliers={suppliers} />
            </Suspense>
        </div>
    );
}
