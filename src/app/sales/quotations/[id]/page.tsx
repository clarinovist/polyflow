import { getQuotationById } from '@/actions/sales/quotations';
import { getLocations } from '@/actions/inventory/inventory';
import { SalesQuotationDetailClient } from '@/components/sales/quotations/SalesQuotationDetailClient';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';

export default async function SalesQuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [quotation, locations] = await Promise.all([
        getQuotationById(id),
        getLocations()
    ]);

    if (!quotation) {
        notFound();
    }

    // Serialize details
    const serializedQuotation = serializeData(quotation);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <SalesQuotationDetailClient quotation={serializedQuotation as any} locations={locations} />
        </div>
    );
}
