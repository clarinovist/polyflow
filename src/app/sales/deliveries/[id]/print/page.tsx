import { getDeliveryOrderById } from '@/actions/inventory/deliveries';
import { SuratJalanDotMatrixPrint } from '@/components/sales/SuratJalanDotMatrixPrint';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function SuratJalanPrintPage({ params }: PrintPageProps) {
  const { id } = await params;
  const result = await getDeliveryOrderById(id);

  if (!result.success) {
    throw new Error(result.error);
  }

  const raw = result.data;
  if (!raw) {
    notFound();
  }

  const order = serializeData(raw);

  return <SuratJalanDotMatrixPrint order={order} showButton={true} />;
}
