import { getInvoiceById } from '@/actions/finance/invoice';
import { InvoiceDotMatrixPrint } from '@/components/finance/invoices/InvoiceDotMatrixPrint';
import { notFound } from 'next/navigation';
import { getCompanyConfigAsync } from '@/lib/config/company';

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoicePrintPage({ params }: PrintPageProps) {
  const { id } = await params;
  const [result, companyConfig] = await Promise.all([
    getInvoiceById(id),
    getCompanyConfigAsync(),
  ]);

  if (!result.success) {
    throw new Error(result.error);
  }

  const raw = result.data;
  if (!raw) {
    notFound();
  }

  // Serialize Prisma Decimal → number for the client component
  const invoice = {
    ...raw,
    totalAmount: Number(raw.totalAmount),
    paidAmount: Number(raw.paidAmount),
    salesOrder: raw.salesOrder
      ? {
          ...raw.salesOrder,
          taxAmount: raw.salesOrder.taxAmount != null ? Number(raw.salesOrder.taxAmount) : 0,
          customer: raw.salesOrder.customer,
          items: raw.salesOrder.items?.map((item: Record<string, unknown>) => ({
            ...item,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice),
            subtotal: Number(item.subtotal),
            enteredQuantity: item.enteredQuantity != null ? Number(item.enteredQuantity) : undefined,
            enteredUnitPrice: item.enteredUnitPrice != null ? Number(item.enteredUnitPrice) : undefined,
          })),
        }
      : undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <InvoiceDotMatrixPrint invoice={invoice} showButton={true} companyConfig={companyConfig as any} />;
}
