import { PageHeader } from '@/components/ui/page-header';

export default function MaklonReturnsPage() {
    return (
        <div className="flex flex-col gap-6">
            <PageHeader
                title="Maklon Returns"
                description="Manage returning of leftover customer-owned materials for Maklon Jasa orders"
            />
            {/* Table goes here */}
            <div className="bg-white dark:bg-sidebar rounded-xl border p-8 flex items-center justify-center text-muted-foreground text-sm">
                No Maklon Returns matching the criteria.
            </div>
        </div>
    );
}
