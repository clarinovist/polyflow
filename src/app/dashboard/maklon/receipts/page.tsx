import { PageHeader } from '@/components/ui/page-header';

export default function MaklonReceiptsPage() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Maklon Receipts"
                description="Manage inward materials owned by customers for Maklon Jasa orders"
            />
            {/* Table goes here */}
            <div className="bg-white dark:bg-sidebar rounded-xl border p-8 flex items-center justify-center text-muted-foreground text-sm">
                No Maklon Receipts matching the criteria.
            </div>
        </div>
    );
}
