import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import type { OperatorProductivityItem } from '@/types/analytics';
import { analyticsLabels } from '@/lib/labels';
import { affalLevelClass } from '@/lib/production/affal';
import {
    classifyAffalLevel,
    resolveProductionAlertThresholds,
    type ProductionAlertThresholds,
} from '@/lib/production/alert-thresholds';
import {
    formatAmount,
    formatCount,
    formatPercent,
} from '@/lib/production/format';
import { groupOperatorsByProcess } from '@/lib/production/operator-comparison';
import { PROCESS_LABELS } from '@/lib/production/output-report';

interface Props {
    data: OperatorProductivityItem[];
    thresholds?: ProductionAlertThresholds;
}

/**
 * Operators compared inside one process at a time. Units differ per process,
 * so there is no cross-process total and no ranking: rows are alphabetical.
 */
export function OperatorProcessComparison({ data, thresholds }: Props) {
    const th = resolveProductionAlertThresholds(thresholds);
    const groups = groupOperatorsByProcess(data);

    return (
        <Card>
            <CardHeader>
                <CardTitle>{analyticsLabels.operatorComparison}</CardTitle>
                <CardDescription>
                    {analyticsLabels.operatorComparisonDesc}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {groups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        {analyticsLabels.operatorComparisonEmpty}
                    </p>
                ) : (
                    groups.map((group) => (
                        <section
                            key={group.process}
                            aria-labelledby={`operator-${group.process}`}
                        >
                            <h3
                                id={`operator-${group.process}`}
                                className="text-sm font-semibold mb-2"
                            >
                                {PROCESS_LABELS[group.process]}
                            </h3>
                            <div className="rounded-md border overflow-x-auto">
                                <Table>
                                    <caption className="sr-only">
                                        Operator {PROCESS_LABELS[group.process]}
                                    </caption>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead scope="col">
                                                Operator
                                            </TableHead>
                                            <TableHead
                                                scope="col"
                                                className="text-right"
                                            >
                                                SPK
                                            </TableHead>
                                            <TableHead
                                                scope="col"
                                                className="text-right"
                                            >
                                                Hasil
                                            </TableHead>
                                            <TableHead
                                                scope="col"
                                                className="text-right"
                                            >
                                                Affal
                                            </TableHead>
                                            <TableHead
                                                scope="col"
                                                className="text-right"
                                            >
                                                % Affal
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {group.operators.map((operator) => (
                                            <TableRow
                                                key={`${group.process}-${operator.operatorCode}`}
                                            >
                                                <TableCell>
                                                    <div className="font-medium">
                                                        {operator.operatorName}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {operator.operatorCode}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatCount(
                                                        operator.ordersHandled,
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatAmount(
                                                        operator.totalQuantityProduced,
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right tabular-nums">
                                                    {formatAmount(
                                                        operator.totalScrapQuantity,
                                                    )}
                                                </TableCell>
                                                <TableCell
                                                    className={`text-right tabular-nums ${affalLevelClass(
                                                        classifyAffalLevel(
                                                            th,
                                                            operator.affalPercent,
                                                        ),
                                                    )}`}
                                                >
                                                    {formatPercent(
                                                        operator.affalPercent,
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </section>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
