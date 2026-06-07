import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function PackingMonthlyReportLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="space-y-2">
                    <div className="h-8 w-80 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-4 w-96 bg-zinc-200 dark:bg-zinc-800 rounded" />
                </div>
                <div className="h-10 w-32 bg-zinc-200 dark:bg-zinc-800 rounded" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="border-zinc-200 dark:border-zinc-800">
                        <CardContent className="pt-6">
                            <div className="h-20 bg-zinc-100 dark:bg-zinc-900/50 rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-zinc-200 dark:border-zinc-800">
                <CardHeader>
                    <div className="h-5 w-48 bg-zinc-200 dark:bg-zinc-800 rounded" />
                    <div className="h-3 w-72 bg-zinc-100 dark:bg-zinc-900 rounded mt-1" />
                </CardHeader>
                <CardContent>
                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md overflow-hidden">
                        <div className="h-10 bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800" />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-12 border-b border-zinc-100 dark:border-zinc-900 last:border-0" />
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
