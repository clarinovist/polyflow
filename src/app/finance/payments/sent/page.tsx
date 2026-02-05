import { getSentPayments } from '@/actions/finance';
import { SharedPaymentTable } from '@/components/finance/SharedPaymentTable';

export const dynamic = 'force-dynamic';

export default async function SentPaymentsPage() {
    const payments = await getSentPayments();

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Supplier Payments</h1>
                <p className="text-muted-foreground">History of payments sent to vendors.</p>
            </div>

            <SharedPaymentTable
                title="Outgoing Transactions"
                description="List of completed payments to suppliers."
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                payments={payments as any}
                type="sent"
            />
        </div>
    );
}
