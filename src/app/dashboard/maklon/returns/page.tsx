import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { getMaklonReturnsAction } from '@/actions/maklon/maklon-return';
import { MaklonReturnTable } from '@/components/planning/maklon/MaklonReturnTable';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default async function MaklonReturnsPage({
    searchParams
}: {
    searchParams?: { [key: string]: string | string[] | undefined }
}) {
    // We can extract search from searchParams, wait for the Next 15 standard, searchParams is a Promise
    const awaitedSearchParams = await searchParams;
    const res = await getMaklonReturnsAction({
        search: typeof awaitedSearchParams?.search === 'string' ? awaitedSearchParams.search : undefined,
    });

    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Maklon Returns"
                description="Manage returning of leftover customer-owned materials for Maklon Jasa orders"
                actions={
                    <Link href="/dashboard/maklon/returns/create">
                        <Button className="bg-primary hover:bg-primary/90">
                            <Plus className="mr-2 h-4 w-4" /> New Maklon Return
                        </Button>
                    </Link>
                }
            />
            
            {res.success && res.data ? (
                <div className="bg-white dark:bg-sidebar rounded-xl border p-0 sm:p-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <MaklonReturnTable initialData={res.data as any} />
                </div>
            ) : (
                <Alert variant="destructive">
                    <AlertDescription>{res.error || 'Failed to load Maklon returns.'}</AlertDescription>
                </Alert>
            )}
        </div>
    );
}
