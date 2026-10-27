import { Info } from 'lucide-react';
import type { VoidedAffalReference } from '@/lib/production/voided-entry-affal';
import { formatWIB } from '@/lib/utils/timezone';
import { formatQuantity } from '@/lib/utils/utils';

// Below one gram the difference is input rounding, not missing affal.
const AFFAL_TOLERANCE_KG = 0.001;

/**
 * Informational only: never blocks saving. Reminds the operator re-entering a
 * voided output that the voided entry recorded more affal than this one.
 */
export function VoidedAffalNotice({
    reference,
    prongkol,
    daun,
}: {
    reference: VoidedAffalReference | null;
    prongkol: number;
    daun: number;
}) {
    const entered = prongkol + daun;
    if (!reference || !(entered < reference.total - AFFAL_TOLERANCE_KG))
        return null;
    // Kiosk entries keep affal only as a total, without prongkol/daun.
    const hasBreakdown = reference.prongkol + reference.daun > 0;
    return (
        <div
            role="status"
            className="space-y-1 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
        >
            <p className="flex items-center gap-2 font-medium">
                <Info className="h-4 w-4 shrink-0" />
                Isian yang dibatalkan{' '}
                {formatWIB(reference.voidedAt, 'dd MMM HH:mm')} WIB mencatat
                affal {formatQuantity(reference.total)} kg
            </p>
            <p>
                {hasBreakdown &&
                    `Rinciannya prongkol ${formatQuantity(reference.prongkol)} kg, daun ${formatQuantity(reference.daun)} kg. `}
                Isian ini {formatQuantity(entered)} kg. Bila affal memang ada,
                isi di sini; bila tidak, bahan sebanyak selisihnya dianggap
                masih ada di stok.
            </p>
        </div>
    );
}
