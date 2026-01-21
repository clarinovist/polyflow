import { getQuotations } from '@/actions/quotations';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { SalesQuotationTable } from '@/components/sales/quotations/SalesQuotationTable';
import { serializeForClient } from '@/lib/serialize';

export default async function SalesQuotationsPage() {
    const quotations = await getQuotations();

    // Serialize all Prisma objects for Client Components
    const serializedQuotations = serializeForClient(quotations);

    return (
        <div className="flex flex-col space-y-6 p-6 max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Sales Quotations</h1>
                    <p className="text-muted-foreground">Manage pre-sales quotations and proposals.</p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/sales/quotations/create">
                        <Plus className="mr-2 h-4 w-4" />
                        New Quotation
                    </Link>
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Recent Quotations</CardTitle>
                </CardHeader>
                <CardContent>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <SalesQuotationTable initialData={serializedQuotations as any} />
                </CardContent>
            </Card>
        </div>
    );
}
