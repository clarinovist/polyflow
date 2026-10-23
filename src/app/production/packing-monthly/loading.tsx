import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function PackingMonthlyReportLoading() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div className="space-y-2">
                    <div className="h-8 w-80 max-w-full bg-muted rounded" />
                    <div className="h-4 w-96 max-w-full bg-muted rounded" />
                </div>
                <div className="h-10 w-32 bg-muted rounded" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card
                        key={i}
                        className="border-border"
                    >
                        <CardContent className="pt-6">
                            <div className="h-20 bg-zinc-100 dark:bg-zinc-900/50 rounded" />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card className="border-border">
                <CardHeader>
                    <div className="h-5 w-48 max-w-full bg-muted rounded" />
                    <div className="h-3 w-72 max-w-full bg-zinc-100 dark:bg-zinc-900 rounded mt-1" />
                </CardHeader>
                <CardContent>
                    <div className="border border-border rounded-md overflow-hidden">
                        <div className="h-10 bg-zinc-50 dark:bg-zinc-900/50 border-b border-border" />
                        {Array.from({ length: 3 }).map((_, i) => (
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
