import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Loading skeleton for /finance/reports/* — report pages open with a
 * filter bar above a wide table, so the placeholder mirrors that shape.
 */
export default function FinanceReportsLoading() {
    return (
        <div className="p-4 md:p-8 space-y-6 animate-pulse">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-2">
                    <div className="h-8 w-64 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-4 w-80 max-w-full bg-zinc-100 dark:bg-zinc-900 rounded" />
                </div>
                <div className="flex gap-2">
                    <div className="h-10 w-[280px] bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-10 w-10 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </div>
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                    <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="h-10 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800" />
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div
                                key={i}
                                className="h-11 border-b border-zinc-100 dark:border-zinc-900 last:border-0"
                            />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
