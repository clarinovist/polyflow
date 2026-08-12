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
import {
    getPerformanceStatusLevel,
    type PerformanceStatusLevel,
} from '@/lib/utils/performance-status';
import type { PerformanceMetricSummary } from '@/actions/admin/performance-metrics';

const P95_TEXT_CLASS: Record<PerformanceStatusLevel, string> = {
    ok: '',
    unknown: 'text-muted-foreground',
    warn: 'text-amber-600 dark:text-amber-400',
    critical: 'text-red-600 dark:text-red-400',
};

interface PerformanceRouteCardProps {
    label: string;
    summaries: PerformanceMetricSummary[];
}

export function PerformanceRouteCard({
    label,
    summaries,
}: PerformanceRouteCardProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{label}</CardTitle>
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
                        {summaries.map((s) => {
                            const p95Level = getPerformanceStatusLevel(s.p95Ms);
                            return (
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
                                    <TableCell
                                        className={`text-right ${P95_TEXT_CLASS[p95Level]}`}
                                    >
                                        {s.p95Ms != null ? `${s.p95Ms}ms` : '—'}
                                        {p95Level === 'warn' && (
                                            <Badge
                                                variant="outline"
                                                className="ml-2 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"
                                            >
                                                {L.p95StatusWarn}
                                            </Badge>
                                        )}
                                        {p95Level === 'critical' && (
                                            <Badge
                                                variant="destructive"
                                                className="ml-2"
                                            >
                                                {L.p95StatusCritical}
                                            </Badge>
                                        )}
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
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
