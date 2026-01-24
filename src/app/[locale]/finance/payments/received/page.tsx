import { getReceivedPayments } from '@/actions/finance';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';

export const dynamic = 'force-dynamic';

export default async function ReceivedPaymentsPage() {
    const payments = await getReceivedPayments();

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Customer Payments</h1>
                <p className="text-muted-foreground">History of payments received from sales.</p>
            </div>

            <SharedPaymentTable
                title="Incoming Transactions"
                description="List of verified payments from your customers."
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payments={payments as any}
                type="received"
            />
        </div>
    );
}
