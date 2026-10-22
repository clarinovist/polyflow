import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { affalLevelClass, affalPercent } from '@/lib/production/affal';
import {
    classifyAffalLevel,
    type ProductionAlertThresholds,
} from '@/lib/production/alert-thresholds';
import { formatAmount, formatPercent } from '@/lib/production/format';
import { PROCESS_LABELS } from '@/lib/production/output-report';
import { PROCESS_KEYS, type ProcessKey } from '@/lib/production/process-keys';
import type { ProcessAffalTotals } from '@/services/analytics/production-analytics-service';

interface Props {
    affalByProcess: Record<ProcessKey, ProcessAffalTotals>;
    thresholds: ProductionAlertThresholds;
}

/**
 * Affal per process. Units differ per process, so there is deliberately no
 * combined total; numbers come from non-voided entries, like Produksi Harian.
 */
export function AffalByProcessCard({ affalByProcess, thresholds }: Props) {
    const rows = PROCESS_KEYS.filter((key) => affalByProcess[key].entries > 0);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                    Affal per Proses
                </CardTitle>
                <AlertTriangle
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                />
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Belum ada hasil pada periode ini
                    </p>
                ) : (
                    <ul className="space-y-1">
                        {rows.map((key) => {
                            const { produced, affal } = affalByProcess[key];
                            const share = affalPercent(produced, affal);
                            return (
                                <li
                                    key={key}
                                    className="flex items-baseline justify-between gap-3 text-sm"
                                >
                                    <span>{PROCESS_LABELS[key]}</span>
                                    <span className="flex items-baseline gap-2 tabular-nums">
                                        <span className="font-semibold">
                                            {formatAmount(affal)}
                                        </span>
                                        <span
                                            className={`text-xs ${affalLevelClass(
                                                classifyAffalLevel(
                                                    thresholds,
                                                    share,
                                                ),
                                            )}`}
                                        >
                                            {formatPercent(share)}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                    Dari entri hasil, tanpa entri dibatalkan. Satuan mengikuti
                    output tiap proses.
                </p>
            </CardContent>
        </Card>
    );
}
