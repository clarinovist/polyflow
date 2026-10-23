import type { SalesReturnStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/utils';
import {
    deriveReturnCreditState,
    type ReturnCreditStateInput,
} from '@/lib/finance/return-credit-state';
import { financeReturnStatuses } from './return-status';

export const returnToneClasses = {
    neutral: 'border-border bg-muted/50 text-muted-foreground',
    info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300',
    warning:
        'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    success:
        'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300',
} as const;

type Tone = keyof typeof returnToneClasses;

export function returnCreditPresentation(row: ReturnCreditStateInput): {
    label: string;
    description: string;
    tone: Tone;
} {
    switch (deriveReturnCreditState(row)) {
        case 'POSTED':
            return {
                label: row.credit?.recoveryActive
                    ? 'Kredit dipulihkan'
                    : 'Terposting',
                description: 'Mengurangi piutang, bukan pembayaran.',
                tone: 'success',
            };
        case 'REVIEW':
            return row.credit?.status === 'REVERSED'
                ? {
                      label: 'Dibalik · perlu dicek',
                      description:
                          'Kredit tidak aktif; periksa pemulihan piutang di Finance.',
                      tone: 'warning',
                  }
                : {
                      label: 'Perlu dicek',
                      description:
                          'Perlu pemeriksaan Finance; piutang belum berkurang.',
                      tone: 'warning',
                  };
        case 'BALANCE':
            return {
                label: 'Saldo kredit pelanggan',
                description: 'Lihat saldo dan pemakaian kredit pelanggan.',
                tone: 'info',
            };
        case 'READY':
            return {
                label: 'Siap diperiksa Finance',
                description: 'Barang diterima; belum mengurangi piutang.',
                tone: 'info',
            };
        case 'AWAITING_GOODS':
            return {
                label: 'Belum dikreditkan',
                description: 'Menunggu barang di Penjualan.',
                tone: 'neutral',
            };
        case 'DRAFT':
            return {
                label: 'Belum dikreditkan',
                description: 'Menunggu konfirmasi di Penjualan.',
                tone: 'neutral',
            };
        case 'CANCELLED':
            return {
                label: 'Tidak dikreditkan',
                description: 'Retur dibatalkan; bukan pengurang piutang.',
                tone: 'neutral',
            };
    }
}

export function ReturnBadge({
    label,
    tone = 'neutral',
}: {
    label: string;
    tone?: Tone;
}) {
    return (
        <Badge
            variant="outline"
            className={cn('gap-1.5 px-2.5 py-1', returnToneClasses[tone])}
        >
            <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-current"
            />
            {label}
        </Badge>
    );
}

export function ReturnOperationalBadge({
    status,
}: {
    status: SalesReturnStatus;
}) {
    return (
        <ReturnBadge
            label={financeReturnStatuses[status]}
            tone={
                status === 'CONFIRMED' || status === 'RECEIVED'
                    ? 'info'
                    : 'neutral'
            }
        />
    );
}
