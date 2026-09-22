import { collectOrderCustomers, formatQualityStandard, type CustomerDestination, type QualityStandardDisplay } from '@/lib/production/order-context';

export function OrderContextSummary({ order, standards = [] }: {
    order: {
        customerDestinations?: { customer: CustomerDestination }[];
        salesOrder?: { customer: CustomerDestination | null } | null;
        maklonCustomer?: CustomerDestination | null;
    };
    standards?: QualityStandardDisplay[];
}) {
    const customers = collectOrderCustomers(order);
    return (
        <div className="space-y-2 text-xs min-w-0">
            <div>
                <span className="font-medium">Customer: </span>
                <span className="break-words">{customers.length ? customers.slice(0, 2).map((c) => c.name).join(', ') : 'Belum ditentukan'}</span>
                {customers.length > 2 && (
                    <details className="mt-1">
                        <summary className="cursor-pointer py-2 text-primary">+{customers.length - 2} customer lainnya</summary>
                        <ul className="space-y-1 break-words">{customers.slice(2).map((c) => <li key={c.id}>{c.name}</li>)}</ul>
                    </details>
                )}
            </div>
            {standards.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-2 space-y-1">
                    <p className="font-medium">Standar kualitas saat ini</p>
                    {standards.map((p) => <p key={p.id} className="break-words">{p.name}: {formatQualityStandard(p)}</p>)}
                </div>
            )}
        </div>
    );
}
