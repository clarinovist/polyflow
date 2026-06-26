import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { SuratJalanDotMatrixPrint } from '@/components/sales/SuratJalanDotMatrixPrint';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import { getCompanyConfigAsync } from '@/lib/config/company';
import type { ComponentProps } from 'react';

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function SuratJalanPrintPage({ params }: PrintPageProps) {
  const { id } = await params;
  const [result, companyConfig] = await Promise.all([
    getDeliveryOrderById(id),
    getCompanyConfigAsync(),
  ]);

  if (!result.success) {
    throw new Error(result.error);
  }

  const raw = result.data;
  if (!raw) {
    notFound();
  }

  const order = serializeData(raw);

  return <SuratJalanDotMatrixPrint order={order as unknown as ComponentProps<typeof SuratJalanDotMatrixPrint>['order']} showButton={true} companyConfig={companyConfig} />;
}
