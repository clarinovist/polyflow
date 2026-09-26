import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Route-level loading skeleton for the whole /purchasing segment.
 *
 * Instant feedback is the visible half. The other half matters for traffic:
 * this boundary is what a prefetch downloads. Without it, prefetching any
 * /purchasing link renders the entire destination page on the server — e.g.
 * the full PO list — for a link the user may never open.
 */
export default function PurchasingLoading() {
    return (
        <div className="p-6 space-y-6 animate-pulse">
            <div className="space-y-2">
                <div className="h-8 w-72 max-w-full bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-4 w-96 max-w-full bg-zinc-100 dark:bg-zinc-900 rounded" />
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                    <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-9 w-28 bg-zinc-100 dark:bg-zinc-900 rounded"
                            />
                        ))}
                    </div>
                    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="h-10 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800" />
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-12 border-b border-zinc-100 dark:border-zinc-900 last:border-0"
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
