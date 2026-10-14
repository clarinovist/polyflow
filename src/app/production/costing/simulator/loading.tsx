import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function HppPriceSimulatorLoading() {
    return (
        <div className="space-y-6" role="status" aria-label="Memuat simulator HPP">
            <div className="space-y-3">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-10 w-80 max-w-full" />
                <Skeleton className="h-5 w-[42rem] max-w-full" />
            </div>
            <Card>
                <CardHeader className="space-y-3">
                    <Skeleton className="h-7 w-36" />
                    <Skeleton className="h-11 w-full" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-52 w-full" />
                    <Skeleton className="h-44 w-full" />
                </CardContent>
            </Card>
            <span className="sr-only">Memuat simulator HPP dan harga…</span>
        </div>
    );
}
