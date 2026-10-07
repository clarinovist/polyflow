import { cn } from '@/lib/utils/utils';

interface MobileDataFreshnessProps {
    generatedAt: string;
    staleAfterMinutes?: number;
    now?: Date;
    className?: string;
}

/** Labels snapshot age without implying that browser connectivity makes data fresh. */
export function MobileDataFreshness({
    generatedAt,
    staleAfterMinutes = 15,
    now = new Date(),
    className,
}: MobileDataFreshnessProps) {
    const generated = new Date(generatedAt);
    if (Number.isNaN(generated.getTime())) return null;

    const stale = now.getTime() - generated.getTime() > staleAfterMinutes * 60_000;
    const label = generated.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
    });

    return (
        <p
            className={cn(
                'text-xs text-muted-foreground',
                stale && 'text-amber-700 dark:text-amber-300',
                className,
            )}
            role={stale ? 'status' : undefined}
        >
            Terakhir diperbarui{' '}
            <time dateTime={generated.toISOString()}>{label} WIB</time>
            {stale ? ' · Data mungkin sudah lama.' : ''}
        </p>
    );
}
