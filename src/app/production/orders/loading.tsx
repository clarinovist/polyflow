import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Page-specific loading skeleton for the Daftar SPK page.
 * Mirrors the real layout shape (title, 4 stats cards, status chips,
 * search bar, table) so the swap from skeleton to content is calm.
 */
export default function ProductionOrdersLoading() {
    return (
        <div className="p-4 md:p-8 space-y-6 animate-pulse">
            {/* Header row: title + action button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-2">
                    <div className="h-9 w-44 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-4 w-80 max-w-full bg-zinc-100 dark:bg-zinc-900 rounded" />
                </div>
                <div className="h-10 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </div>

            {/* Stats cards */}
            <div className="grid gap-4 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <Card
                        key={i}
                        className="border-zinc-200 dark:border-zinc-800"
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                <span className="block h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
                            </CardTitle>
                            <span className="block h-4 w-4 bg-zinc-200 dark:bg-zinc-800 rounded" />
                        </CardHeader>
                        <CardContent>
                            <div className="h-7 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Category tabs + status chips */}
            <div className="flex gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-8 w-20 rounded-md bg-zinc-200 dark:bg-zinc-800"
                    />
                ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div
                        key={i}
                        className="h-6 w-16 rounded-full bg-zinc-200 dark:bg-zinc-800"
                    />
                ))}
            </div>

            {/* Search bar */}
            <div className="flex gap-2">
                <div className="h-10 flex-1 max-w-md rounded-md bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-10 w-20 rounded-md bg-zinc-200 dark:bg-zinc-800" />
            </div>

            {/* Table */}
            <Card className="border border-zinc-200 dark:border-zinc-800">
                <CardHeader className="pb-3">
                    <div className="h-5 w-40 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                        <div className="h-10 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800" />
                        {Array.from({ length: 8 }).map((_, i) => (
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
