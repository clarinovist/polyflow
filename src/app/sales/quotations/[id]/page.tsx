import { getQuotationById } from '@/actions/sales/quotations';
import { getLocations } from '@/actions/inventory/inventory';
import { SalesQuotationDetailClient } from '@/components/sales/quotations/SalesQuotationDetailClient';
import { notFound } from 'next/navigation';
import { serializeData } from '@/lib/utils/utils';

export default async function SalesQuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const [quotationRes, locationsRes] = await Promise.all([
        getQuotationById(id),
        getLocations()
    ]);
    
    const quotation = quotationRes?.success && quotationRes.data ? quotationRes.data : null;
    const locations = locationsRes?.success && locationsRes.data ? locationsRes.data : [];

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
