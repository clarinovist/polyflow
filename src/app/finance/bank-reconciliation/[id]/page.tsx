import { getReconciliation } from '@/actions/finance/reconciliation-actions';
import { BankReconciliationDetailClient } from '@/components/finance/reconciliation/BankReconciliationDetailClient';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BankReconciliationDetailPage({ params }: PageProps) {
  const { id } = await params;

  let reconciliation;
  try {
    const result = await getReconciliation(id);
    if (!result || !result.success || !result.data) {
      notFound();
    }
    reconciliation = serializeData(result.data);
  } catch (error) {
    console.error('Error fetching reconciliation:', error);
    notFound();
  }

  return (
    <BankReconciliationDetailClient reconciliation={reconciliation} />
  );
}
