import {
    AlertTriangle,
    CheckCircle2,
    ClipboardCheck,
    MapPin,
    Paperclip,
    Scale,
} from 'lucide-react';
import { WorkflowSummaryGrid } from '@/components/workflow-detail/WorkflowSummaryGrid';

interface OpnameReadinessSummaryProps {
    locationName: string;
    itemCount: number;
    countedCount: number;
    varianceCount: number;
    attachmentCount: number;
    isOpen: boolean;
}

export function OpnameReadinessSummary({
    locationName,
    itemCount,
    countedCount,
    varianceCount,
    attachmentCount,
    isOpen,
}: OpnameReadinessSummaryProps) {
    const uncountedCount = itemCount - countedCount;

    return (
        <div className="space-y-3">
            <WorkflowSummaryGrid
                label="Ringkasan stock opname"
                items={[
                    {
                        label: 'Lokasi',
                        icon: <MapPin className="h-4 w-4" />,
                        value: locationName,
                        detail: isOpen ? 'Sesi sedang berjalan' : 'Sesi selesai',
                    },
                    {
                        label: 'Kemajuan Hitung',
                        icon: <ClipboardCheck className="h-4 w-4" />,
                        value:
                            countedCount +
                            ' dari ' +
                            itemCount +
                            ' item dihitung',
                        detail:
                            uncountedCount > 0
                                ? uncountedCount + ' item belum dihitung'
                                : 'Semua item sudah dihitung',
                    },
                    {
                        label: 'Selisih',
                        icon: <Scale className="h-4 w-4" />,
                        value: varianceCount + ' item berselisih',
                        detail:
                            varianceCount > 0
                                ? 'Perlu ditinjau sebelum finalisasi'
                                : 'Tidak ada selisih tercatat',
                    },
                    {
                        label: 'Bukti',
                        icon: <Paperclip className="h-4 w-4" />,
                        value: attachmentCount + ' lampiran',
                        detail: 'Foto atau berita acara bersifat opsional',
                    },
                ]}
            />

            {isOpen && (
                <div
                    role="status"
                    className={
                        'flex items-start gap-3 rounded-xl border p-4 text-sm ' +
                        (uncountedCount > 0 || varianceCount > 0
                            ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100')
                    }
                >
                    {uncountedCount > 0 || varianceCount > 0 ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                    ) : (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                    )}
                    <div>
                        <p className="font-semibold">
                            {uncountedCount > 0
                                ? uncountedCount + ' item belum dihitung'
                                : varianceCount > 0
                                  ? varianceCount + ' selisih perlu ditinjau'
                                  : 'Siap untuk finalisasi'}
                        </p>
                        <p className="mt-1 opacity-80">
                            {uncountedCount > 0
                                ? 'Item yang belum dihitung tidak akan disesuaikan saat finalisasi. Periksa tab Hitung Fisik terlebih dahulu.'
                                : varianceCount > 0
                                  ? 'Pastikan seluruh selisih sesuai hasil pemeriksaan fisik sebelum menerapkan penyesuaian stok.'
                                  : 'Seluruh item telah dihitung tanpa selisih. Validasi server tetap dilakukan saat finalisasi.'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
