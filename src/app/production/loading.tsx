import { Card, CardContent, CardHeader } from '@/components/ui/card';

/**
 * Route-level loading skeleton for the whole /production segment.
 * Shows instantly while the server renders any child page, so a
 * click never feels like "nothing happened".
 */
export default function ProductionLoading() {
    return (
        <div className="p-4 md:p-8 space-y-6 animate-pulse">
            <div className="space-y-2">
                <div className="h-8 w-72 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-4 w-96 max-w-full bg-zinc-100 dark:bg-zinc-900 rounded" />
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card
                        key={i}
                        className="border-zinc-200 dark:border-zinc-800"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
                            <div className="h-4 w-4 bg-zinc-200 dark:bg-zinc-800 rounded" />
                        </CardHeader>
                        <CardContent className="pt-1">
                            <div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                    <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </CardHeader>
                <CardContent>
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
