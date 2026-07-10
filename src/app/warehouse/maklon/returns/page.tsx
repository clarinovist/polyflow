import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getMaklonReturnsAction } from '@/actions/maklon/maklon-return';
import { MaklonReturnTable } from '@/components/production/maklon/MaklonReturnTable';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function WarehouseMaklonReturnsPage({
    searchParams
}: {
    searchParams?: { [key: string]: string | string[] | undefined }
}) {
    const awaitedSearchParams = await searchParams;
    const res = await getMaklonReturnsAction({
        search: typeof awaitedSearchParams?.search === 'string' ? awaitedSearchParams.search : undefined,
    });

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Retur Maklon"
                description="Kelola pengembalian sisa bahan milik customer dari order Maklon Jasa"
                actions={
                    <Link href="/warehouse/maklon/returns/create">
                        <Button className="bg-primary hover:bg-primary/90">
                            <Plus className="mr-2 h-4 w-4" /> Retur Maklon Baru
                        </Button>
                    </Link>
                }
            />
            
            {res.success && res.data ? (
                <div className="bg-white dark:bg-sidebar rounded-xl border p-0 sm:p-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <MaklonReturnTable initialData={res.data as any} basePath="/warehouse/maklon/returns" />
                </div>
            ) : (
                <Alert variant="destructive">
                    <AlertDescription>{res.error || 'Gagal memuat retur Maklon.'}</AlertDescription>
                </Alert>
            )}
        </div>
    );
}
