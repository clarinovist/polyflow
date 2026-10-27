import type { InternalUsageReadiness } from '@/types/internal-usage';

const rupiah = (value: number) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        maximumFractionDigits: 2,
    }).format(value);

/** Finance/Admin only: where this SKU's value sits and which account is credited. */
export function AccountingDetail({
    accounting,
}: {
    accounting: NonNullable<InternalUsageReadiness['accounting']>;
}) {
    return (
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
            {accounting.amount !== undefined && (
                <div>Nilai pemakaian: {rupiah(accounting.amount)}</div>
            )}
            {accounting.inventoryAccount && (
                <div>
                    Kredit: {accounting.inventoryAccount.code}{' '}
                    {accounting.inventoryAccount.name}
                    {accounting.glBalance !== undefined &&
                        ` (saldo ${rupiah(accounting.glBalance)})`}
                </div>
            )}
            {accounting.expenseAccount && (
                <div>
                    Debit: {accounting.expenseAccount.code}{' '}
                    {accounting.expenseAccount.name}
                </div>
            )}
            <div>
                Nilai SKU per akun:{' '}
                {accounting.basis.length
                    ? accounting.basis
                          .map(
                              (row) =>
                                  `${row.code} ${row.name} ${rupiah(row.value)}`,
                          )
                          .join(' · ')
                    : 'belum ada jurnal penerimaan yang tertaut'}
            </div>
        </dl>
    );
}
