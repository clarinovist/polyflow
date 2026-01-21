import { getQuotationById } from '@/actions/quotations';
import { getLocations } from '@/actions/inventory';
import { SalesQuotationDetailClient } from '@/components/sales/quotations/SalesQuotationDetailClient';
import { notFound } from 'next/navigation';
import { serializeForClient } from '@/lib/serialize';

export default async function SalesQuotationDetailPage({ params }: { params: { id: string } }) {
    const [quotation, locations] = await Promise.all([
        getQuotationById(params.id),
        getLocations()
    ]);

    if (!quotation) {
        notFound();
    }

    // Serialize details
    const serializedQuotation = serializeForClient(quotation);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <SalesQuotationDetailClient quotation={serializedQuotation as any} locations={locations} />
        </div>
    );
}
