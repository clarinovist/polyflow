import { Boxes, Building2, FileText, MapPin } from 'lucide-react';
import { WorkflowSummaryGrid } from './WorkflowSummaryGrid';
import { formatRupiah } from '@/lib/utils/utils';

interface ReturnSummaryGridProps {
    partyLabel: string;
    partyName: string;
    sourceLabel: string;
    sourceNumber: string;
    locationName: string;
    itemCount: number;
    totalAmount: number | null;
}

export function ReturnSummaryGrid({
    partyLabel,
    partyName,
    sourceLabel,
    sourceNumber,
    locationName,
    itemCount,
    totalAmount,
}: ReturnSummaryGridProps) {
    return (
        <WorkflowSummaryGrid
            label="Ringkasan retur"
            items={[
                {
                    label: partyLabel,
                    icon: <Building2 className="h-4 w-4" />,
                    value: partyName,
                },
                {
                    label: sourceLabel,
                    icon: <FileText className="h-4 w-4" />,
                    value: sourceNumber,
                },
                {
                    label: 'Lokasi Retur',
                    icon: <MapPin className="h-4 w-4" />,
                    value: locationName,
                },
                {
                    label: 'Nilai & Item',
                    icon: <Boxes className="h-4 w-4" />,
                    value:
                        totalAmount === null
                            ? 'Nilai belum tersedia'
                            : formatRupiah(totalAmount),
                    detail: itemCount + ' varian',
                },
            ]}
        />
    );
}
