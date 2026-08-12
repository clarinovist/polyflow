import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getPerformanceMetricsSummary } from '@/actions/admin/performance-metrics';
import { PRODUCTION_ORDERS_LIST_ROUTE } from '@/lib/constants/production';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableHeader,
    TableBody,
    TableHead,
    TableRow,
    TableCell,
} from '@/components/ui/table';
import { performanceLabels as L } from '@/lib/labels/admin';

// Routes with an active PerformanceMetric writer. Extend when another route
// gets instrumented (see src/actions/production/production-orders.ts).
const MONITORED_ROUTES = [
    { key: PRODUCTION_ORDERS_LIST_ROUTE, label: L.routeProductionOrdersList },
];

export default async function PerformancePage() {
    const session = await auth();

    if (!session?.user || !session.user.isSuperAdmin) {
        redirect('/dashboard');
    }

    const summaries = await getPerformanceMetricsSummary(
        MONITORED_ROUTES[0].key,
    );

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">{L.title}</h2>
                <p className="text-muted-foreground mt-1">{L.description}</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>{MONITORED_ROUTES[0].label}</CardTitle>
                    <CardDescription>{L.windowDescription}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{L.tenant}</TableHead>
                                <TableHead>{L.status}</TableHead>
                                <TableHead className="text-right">
                                    {L.requestCount}
                                </TableHead>
                                <TableHead className="text-right">
                                    {L.avgMs}
                                </TableHead>
                                <TableHead className="text-right">
                                    {L.p95Ms}
                                </TableHead>
                                <TableHead className="text-right">
                                    {L.maxMs}
                                </TableHead>
                                <TableHead className="text-right">
                                    {L.lastMeasuredAt}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {summaries.length === 0 && (
                                <TableRow>
                                    <TableCell
                                        colSpan={7}
                                        className="text-center text-muted-foreground"
                                    >
                                        {L.noTenants}
                                    </TableCell>
                                </TableRow>
                            )}
                            {summaries.map((s) => (
                                <TableRow key={s.tenantId}>
                                    <TableCell className="font-medium">
                                        {s.tenantName}
                                    </TableCell>
                                    <TableCell>
                                        {s.online ? (
                                            <Badge
                                                variant="outline"
                                                className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20"
                                            >
                                                {L.online}
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="destructive"
                                                title={s.error}
                                            >
                                                {L.offline}
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {s.count}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {s.avgMs != null ? `${s.avgMs}ms` : '—'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {s.p95Ms != null ? `${s.p95Ms}ms` : '—'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {s.maxMs != null ? `${s.maxMs}ms` : '—'}
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">
                                        {s.lastAt
                                            ? new Date(
                                                  s.lastAt,
                                              ).toLocaleString()
                                            : '—'}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
