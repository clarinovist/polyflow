import { formatWibDate } from '@/lib/utils/timezone';

/** Thumbnail link to the receipt photo; opens the original in a new tab. */
export function ClaimReceiptLink({
    receiptUrl,
    claimNumber,
}: {
    receiptUrl: string;
    claimNumber: string;
}) {
    return (
        <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-fit items-center gap-2 text-xs font-medium text-primary"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={receiptUrl}
                alt={`Nota ${claimNumber}`}
                className="h-10 w-10 rounded object-cover"
            />
            Lihat nota
        </a>
    );
}

/** "24 Nov 2026" in WIB for a serialized expense date. */
export function formatClaimDate(value: string): string {
    return formatWibDate(value);
}
