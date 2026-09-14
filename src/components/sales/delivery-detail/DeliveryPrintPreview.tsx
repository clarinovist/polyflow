import type { DeliveryOrderDetailData } from './types';
import type { Dispatch, SetStateAction } from 'react';
import type { CompanyConfig } from '@/lib/config/company';
import { PrintPreviewModal } from '@/components/ui/print-preview-modal';
import {
    SuratJalanDotMatrixPrint,
    type SuratJalanPrintData,
} from '@/components/sales/SuratJalanDotMatrixPrint';

interface DeliveryPrintPreviewProps {
    order: DeliveryOrderDetailData;
    companyConfig?: CompanyConfig;
    showPreview: boolean;
    setShowPreview: Dispatch<SetStateAction<boolean>>;
}

export function DeliveryPrintPreview({
    order,
    companyConfig,
    showPreview,
    setShowPreview,
}: DeliveryPrintPreviewProps) {
    return (
        <PrintPreviewModal
            open={showPreview}
            onOpenChange={setShowPreview}
            title={`Surat Jalan ${order.orderNumber}`}
            landscape={true}
        >
            <SuratJalanDotMatrixPrint
                order={order as unknown as SuratJalanPrintData}
                showButton={false}
                previewMode={true}
                companyConfig={companyConfig}
            />
        </PrintPreviewModal>
    );
}
