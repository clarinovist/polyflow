import { kioskLabels } from '@/lib/labels';

export interface KioskOutputHistoryLog {
    id: string;
    recordedAt: string | Date;
    operatorName: string | null;
    /** Base unit, as stored. */
    quantity: number;
    enteredQuantity: number | null;
    enteredUnit: string | null;
    scrapKg: number;
    packaging: Array<{ name: string; quantity: number; unit: string }>;
}

const TIME = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
});
const num = (value: number) =>
    value.toLocaleString('id-ID', { maximumFractionDigits: 2 });
// Stock units read as the floor says them: PCS → pcs, KG stays KG.
const unitLabel = (unit: string) => (unit === 'PCS' ? 'pcs' : unit);

/** Every recorded output of the SPK, with the packaging it used. */
export function KioskOutputHistory({
    logs,
    primaryUnit,
}: {
    logs: KioskOutputHistoryLog[];
    primaryUnit: string;
}) {
    return (
        <section className="grid gap-3 rounded-2xl border-2 border-border bg-card p-4">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-bold">
                    {kioskLabels.historyTitle}
                </h2>
                {logs.length > 0 && (
                    <span className="text-base text-muted-foreground">
                        {logs.length} {kioskLabels.historyCount}
                    </span>
                )}
            </div>
            {logs.length === 0 ? (
                <p className="text-base text-muted-foreground">
                    {kioskLabels.historyEmpty}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-base">
                        <thead className="text-sm text-muted-foreground">
                            <tr className="border-b">
                                <th className="py-2 pr-3 font-semibold">
                                    {kioskLabels.historyTime}
                                </th>
                                <th className="py-2 pr-3 font-semibold">
                                    {kioskLabels.historyOperator}
                                </th>
                                <th className="py-2 pr-3 font-semibold">
                                    {kioskLabels.historyOutput}
                                </th>
                                <th className="py-2 pr-3 font-semibold">
                                    {kioskLabels.historyPackaging}
                                </th>
                                <th className="py-2 font-semibold">
                                    {kioskLabels.historyScrap}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr
                                    key={log.id}
                                    className="border-b last:border-0"
                                >
                                    <td className="py-2.5 pr-3 tabular-nums">
                                        {TIME.format(new Date(log.recordedAt))}
                                    </td>
                                    <td className="py-2.5 pr-3">
                                        {log.operatorName ?? '-'}
                                    </td>
                                    <td className="py-2.5 pr-3 font-semibold tabular-nums">
                                        {log.enteredQuantity != null &&
                                        log.enteredUnit
                                            ? `${num(log.enteredQuantity)} ${log.enteredUnit}`
                                            : `${num(log.quantity)} ${primaryUnit}`}
                                    </td>
                                    <td className="py-2.5 pr-3">
                                        {log.packaging.length
                                            ? log.packaging
                                                  .map(
                                                      (item) =>
                                                          `${item.name} ${num(item.quantity)} ${unitLabel(item.unit)}`,
                                                  )
                                                  .join(' · ')
                                            : '-'}
                                    </td>
                                    <td className="py-2.5 tabular-nums">
                                        {log.scrapKg > 0
                                            ? `${num(log.scrapKg)} KG`
                                            : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
