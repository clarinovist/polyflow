'use client';

const rupiah = (value: string) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value));

const ANOMALY_LABELS: Record<string, string> = {
    VOIDED_EXECUTIONS: 'hasil pernah di-void',
    UNLINKED_REVERSALS_RETAINED: 'pembalik lama tanpa tautan sumber',
    NEGATIVE_ACCOUNT_POOLS_RETAINED: 'saldo akun WIP negatif dipertahankan',
    JOURNALED_SCRAP_RETAINED: 'affal berjurnal',
    UNALLOCATED_SCRAP_RETAINED: 'affal tanpa atribusi hasil',
    NULL_SCRAP_COST_RETAINED: 'affal tanpa biaya',
};

export interface LegacySealBalance {
    accountId: string;
    code: string | null;
    name: string | null;
    amount: string;
}

export interface LegacySealAnomaly {
    category: string;
    count: number;
}

export function LegacySealPreview({
    outputCount,
    movementCount,
    materialIssueCount,
    scrapRecordCount,
    balances,
    anomalies,
    acknowledged,
    disabled,
    onAcknowledgeChange,
}: {
    outputCount: number;
    movementCount: number;
    materialIssueCount: number;
    scrapRecordCount: number;
    balances: LegacySealBalance[];
    anomalies: LegacySealAnomaly[];
    acknowledged: boolean;
    disabled: boolean;
    onAcknowledgeChange: (checked: boolean) => void;
}) {
    const voidedCount =
        anomalies.find((a) => a.category === 'VOIDED_EXECUTIONS')?.count ?? 0;

    return (
        <div className="space-y-3 text-sm">
            <ul className="list-disc pl-5 space-y-2">
                <li>
                    {outputCount} hasil ({voidedCount} di antaranya di-void),{' '}
                    {movementCount} mutasi, {materialIssueCount} catatan
                    pengeluaran bahan, dan {scrapRecordCount} catatan affal ikut
                    dibekukan tanpa perubahan nilai.
                </li>
                <li>
                    Hasil, bahan, dan affal lama tidak diubah atau
                    direkonsiliasi; pembatalan catatan sebelum batas tetap
                    memerlukan pemeriksaan khusus.
                </li>
            </ul>
            <div className="space-y-1">
                <p className="font-medium">
                    Saldo historis per akun (tanda negatif dipertahankan):
                </p>
                <ul className="list-disc pl-5 space-y-1">
                    {balances.map((b) => (
                        <li key={b.accountId}>
                            {b.code && b.name
                                ? `${b.code} — ${b.name}`
                                : b.accountId}
                            : {rupiah(b.amount)}
                            {b.amount.startsWith('-') ? ' (negatif)' : ''}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="space-y-1">
                <p className="font-medium">
                    Anomali historis yang dipertahankan:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                    {anomalies.map((a) => (
                        <li key={a.category}>
                            {ANOMALY_LABELS[a.category] ?? a.category}:{' '}
                            {a.count}
                        </li>
                    ))}
                </ul>
            </div>
            <label className="flex items-start gap-3 min-h-11">
                <input
                    type="checkbox"
                    className="mt-1 h-5 w-5"
                    checked={acknowledged}
                    disabled={disabled}
                    onChange={(e) => onAcknowledgeChange(e.target.checked)}
                />
                <span>
                    Saya memahami anomali di atas tetap dipertahankan dan tidak
                    direkonsiliasi
                </span>
            </label>
        </div>
    );
}
