import { Skeleton } from '@/components/ui/skeleton';
export default function Loading() {
    return (
        <div
            className="space-y-6 p-4 md:p-6"
            aria-label="Memuat daftar Surat Jalan"
        >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-9 w-56" />
                    <Skeleton className="h-5 w-80 max-w-full" />
                </div>
                <Skeleton className="h-11 w-44" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-11 w-32" />
                ))}
            </div>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-80 w-full" />
        </div>
    );
}
