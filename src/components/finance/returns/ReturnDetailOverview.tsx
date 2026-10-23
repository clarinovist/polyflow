import { Check, CircleAlert, Clock3, Undo2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn, formatRupiah } from '@/lib/utils/utils';
import { toBusinessDateString } from '@/lib/utils/timezone';
import type { FinanceReturnDetail } from '@/services/finance/sales-return-query-service';
import { deriveReturnCreditState } from '@/lib/finance/return-credit-state';
import { financeReturnGuidance } from './return-status';
import {
    returnCreditPresentation,
    returnToneClasses,
} from './ReturnStatusBadge';

export function ReturnDetailOverview({ row }: { row: FinanceReturnDetail }) {
    const state = deriveReturnCreditState(row);
    const presentation = returnCreditPresentation(row);
    const received = row.status === 'RECEIVED' || row.status === 'COMPLETED';
    const confirmed = received || row.status === 'CONFIRMED';
    const active = state === 'POSTED';
    const reversed = state === 'REVIEW' && row.credit?.status === 'REVERSED';
    const steps = [
        {
            title: 'Dikonfirmasi',
            caption: 'Penjualan',
            done: confirmed,
            current: row.status === 'DRAFT',
        },
        {
            title: 'Barang diterima',
            caption: 'Penjualan',
            done: received,
            current: row.status === 'CONFIRMED',
        },
        {
            title: 'Kredit piutang',
            caption: `Finance · ${presentation.label.toLowerCase()}`,
            done: active,
            current:
                state === 'READY' || state === 'REVIEW' || state === 'BALANCE',
        },
    ];
    const message = reversed
        ? `Kredit ${formatRupiah(Number(row.credit?.totalAmount))} dibalik${row.credit?.reversedAt ? ` pada ${toBusinessDateString(new Date(row.credit.reversedAt))}` : ''}. ${row.credit?.reversalReason || ''} Kredit tidak aktif; periksa piutang di Finance.`
        : state === 'POSTED'
          ? `${row.credit?.recoveryActive ? 'Kredit dipulihkan' : 'Kredit terposting'} ${formatRupiah(Number(row.credit?.totalAmount))}. Sisa tagihan berkurang; bukan pembayaran dan tidak ada refund otomatis.`
          : state === 'BALANCE'
            ? 'Retur terhubung ke saldo kredit pelanggan. Periksa status, saldo, dan pemakaiannya; penerbitan bukan pembayaran atau pemotongan invoice otomatis.'
            : state === 'REVIEW'
              ? row.credit?.reviewReason || presentation.description
              : state === 'AWAITING_GOODS'
                ? 'Menunggu penerimaan barang di Penjualan. Piutang belum berkurang.'
                : financeReturnGuidance(row.status);
    const StatusIcon = reversed
        ? Undo2
        : active
          ? Check
          : state === 'REVIEW'
            ? CircleAlert
            : Clock3;

    return (
        <>
            <Card className="p-5 shadow-none">
                <ol
                    aria-label="Tahapan retur"
                    className="grid gap-5 sm:grid-cols-3"
                >
                    {steps.map((step, index) => (
                        <li
                            key={step.title}
                            aria-current={step.current ? 'step' : undefined}
                            className="flex min-w-0 items-center gap-3"
                        >
                            <span
                                className={cn(
                                    'flex size-8 shrink-0 items-center justify-center rounded-full border text-sm',
                                    step.done
                                        ? returnToneClasses.success
                                        : step.current
                                          ? returnToneClasses.info
                                          : returnToneClasses.neutral,
                                )}
                            >
                                {step.done ? (
                                    <Check
                                        className="size-4"
                                        aria-label="Selesai"
                                    />
                                ) : (
                                    <span>{index + 1}</span>
                                )}
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold">
                                    {step.title}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {step.caption}
                                </p>
                            </div>
                            {index < 2 && (
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        'ml-1 hidden h-px min-w-3 flex-1 sm:block',
                                        step.done
                                            ? 'bg-emerald-300 dark:bg-emerald-900'
                                            : 'bg-border',
                                    )}
                                />
                            )}
                        </li>
                    ))}
                </ol>
                {row.status === 'CANCELLED' && (
                    <p className="text-sm text-muted-foreground">
                        Retur dibatalkan. Tahapan operasional tidak dilanjutkan.
                    </p>
                )}
            </Card>
            <div
                role="status"
                className={cn(
                    'flex items-start gap-3 rounded-xl border px-5 py-4 text-sm',
                    returnToneClasses[presentation.tone],
                )}
            >
                <StatusIcon
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                />
                <p>{message}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Metric
                    label="Nilai dokumen"
                    value={formatRupiah(row.totalAmount)}
                    note="Harga tercatat di retur, bukan kredit terposting."
                />
                <Metric
                    label={
                        state === 'BALANCE'
                            ? 'Saldo kredit pelanggan'
                            : 'Kredit piutang aktif'
                    }
                    value={
                        row.customerCredit ? (
                            <Link
                                href={`/finance/returns/credits/${row.customerCredit.id}`}
                                className="inline-flex min-h-11 items-center text-lg underline underline-offset-4"
                            >
                                Lihat saldo & pemakaian
                            </Link>
                        ) : (
                            formatRupiah(
                                active ? Number(row.credit?.totalAmount) : 0,
                            )
                        )
                    }
                    note={
                        reversed
                            ? `${formatRupiah(Number(row.credit?.totalAmount))} dibalik; kredit tidak aktif.`
                            : presentation.description
                    }
                />
                {row.invoices.length ? (
                    row.invoices.map((invoice) => (
                        <Metric
                            key={invoice.id}
                            label={`Sisa tagihan · ${invoice.invoiceNumber}`}
                            value={formatRupiah(Number(invoice.remaining))}
                            note={
                                invoice.status === 'DRAFT'
                                    ? 'Invoice draft; belum menjadi piutang yang dapat dikreditkan.'
                                    : `Total invoice asli ${formatRupiah(Number(invoice.totalAmount))}`
                            }
                        />
                    ))
                ) : (
                    <Metric
                        label="Sisa tagihan"
                        value="—"
                        note="Belum ada invoice terkait. Bukan berarti tagihan lunas."
                    />
                )}
            </div>
        </>
    );
}

function Metric({
    label,
    value,
    note,
}: {
    label: string;
    value: ReactNode;
    note: string;
}) {
    return (
        <Card className="min-w-0 gap-1 p-5 shadow-none">
            <p className="break-words text-xs text-muted-foreground">{label}</p>
            <p className="break-words text-2xl font-semibold tracking-tight tabular-nums">
                {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </Card>
    );
}
